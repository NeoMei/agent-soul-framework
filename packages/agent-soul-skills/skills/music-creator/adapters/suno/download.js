/**
 * suno download — download a generated Suno clip (audio + cover + lyrics).
 *
 * Strategy: UI (browser) — we need window.Clerk.session.getToken() for API auth,
 * and we use browser fetch (page.evaluate) for downloads to avoid Node.js TLS issues.
 *
 * Audio source priority:
 *   1. M4A — from clip.media_urls (highest quality, if available).
 *   2. WAV — from clip.media_urls first, then fallback to CDN.
 *   3. MP3 — from clip.media_urls first, then fallback to CDN.
 *
 * Lyrics are taken from clip.metadata.prompt.
 * Cover image is taken from clip.image_url.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError, AuthRequiredError } from '@jackwener/opencli/errors';
import * as fs from 'fs';
import * as path from 'path';

const SUNO_API = 'https://studio-api-prod.suno.com';

cli({
  site: 'suno',
  name: 'download',
  description: '下载 Suno 生成的歌曲（音频 + 封面 + 歌词），支持 MP3/WAV/M4A',
  access: 'write',
  domain: 'studio-api-prod.suno.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'id',
      positional: true,
      required: true,
      type: 'string',
      help: 'Suno clip ID（如 f816c553-b585-402a-9387-5ceef48a1bb3）',
    },
    {
      name: 'output-dir',
      type: 'string',
      default: '',
      help: '输出目录（默认 ~/openclaw/media/inbound/）',
    },
    {
      name: 'audio-format',
      type: 'string',
      default: 'mp3',
      help: '音频格式: mp3 / wav / m4a（默认 mp3）',
    },
  ],
  columns: ['id', 'title', 'audio_file', 'cover_file', 'lyrics_file', 'duration', 'format', 'source'],
  func: async (page, args) => {
    const clipId = String(args.id ?? '').trim();
    if (!clipId) {
      throw new CliError('INVALID_ARGUMENT', 'clip id is required');
    }

    const format = String(args['audio-format'] ?? 'mp3').toLowerCase();
    if (!['mp3', 'wav', 'm4a'].includes(format)) {
      throw new CliError('INVALID_ARGUMENT', 'format must be mp3, wav, or m4a');
    }

    // Resolve output directory
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
    const defaultDir = path.join(homeDir, 'openclaw', 'media', 'inbound');
    const outputDir = args['output-dir']
      ? path.resolve(String(args['output-dir']))
      : defaultDir;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // ── 1. Get Clerk token via browser ──
    await page.goto('https://suno.com');
    await page.wait(3);

    // Poll for Clerk session (may need time to initialize after cold start)
    let sess = null;
    for (let i = 0; i < 15; i++) {
      const sessRaw = await page.evaluate(`
        (async () => {
          if (!window.Clerk?.session) return JSON.stringify({ ok: false });
          try {
            const tok = await window.Clerk.session.getToken();
            return JSON.stringify({ ok: !!tok, token: tok });
          } catch (e) {
            return JSON.stringify({ ok: false, err: String(e) });
          }
        })()
      `);
      sess = JSON.parse(sessRaw);
      if (sess.ok) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!sess || !sess.ok) {
      throw new AuthRequiredError('suno.com');
    }

    // ── 2. Fetch clip details via browser fetch ──
    const feedRaw = await page.evaluate(`
      (async () => {
        try {
          const resp = await fetch('${SUNO_API}/api/feed/v2?ids=${encodeURIComponent(clipId)}', {
            headers: { Authorization: 'Bearer ${sess.token}' }
          });
          const data = await resp.json();
          return JSON.stringify({ ok: true, data });
        } catch (e) {
          return JSON.stringify({ ok: false, err: String(e) });
        }
      })()
    `);
    const feedResult = JSON.parse(feedRaw);
    if (!feedResult.ok) {
      throw new CliError('API_ERROR', feedResult.err);
    }

    const clip = feedResult.data?.clips?.[0];
    if (!clip) {
      throw new CliError('NO_DATA', 'clip ' + clipId + ' not found');
    }

    const title = String(clip.title || '');
    const duration = Number(clip?.metadata?.duration ?? 0);
    const lyrics = String(clip?.metadata?.prompt || '');
    const coverUrl = String(clip.image_url || '');
    const safeTitle = title.replace(/[^\w一-龥\-]/g, '_').slice(0, 40) || clipId;
    const mediaUrls = clip.media_urls || [];

    // Helper: download binary via browser fetch and return base64
    async function browserFetchBinary(url) {
      const result = await page.evaluate(`
        (async () => {
          try {
            const resp = await fetch('${url.replace(/'/g, "\\'")}');
            if (!resp.ok) return JSON.stringify({ ok: false, status: resp.status });
            const buf = await resp.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            return JSON.stringify({ ok: true, data: btoa(binary) });
          } catch (e) {
            return JSON.stringify({ ok: false, err: String(e) });
          }
        })()
      `);
      return JSON.parse(result);
    }

    // ── 3. Download cover via browser fetch ──
    let coverFile = '';
    if (coverUrl) {
      const coverExt = coverUrl.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] || 'jpg';
      coverFile = path.join(outputDir, safeTitle + '_' + clipId + '_cover.' + coverExt);
      const coverResult = await browserFetchBinary(coverUrl);
      if (coverResult.ok) {
        fs.writeFileSync(coverFile, Buffer.from(coverResult.data, 'base64'));
      } else {
        console.warn('[download] Cover download failed: ' + (coverResult.status || coverResult.err));
        coverFile = '';
      }
    }

    // ── 4. Save lyrics ──
    let lyricsFile = '';
    if (lyrics) {
      lyricsFile = path.join(outputDir, safeTitle + '_' + clipId + '_lyrics.txt');
      fs.writeFileSync(lyricsFile, lyrics, 'utf-8');
    }

    // ── 5. Download audio ──
    let audioFile = '';
    let source = 'cdn';
    let actualFormat = format;

    // If m4a is requested, try media_urls first
    if (format === 'm4a') {
      const m4aEntry = mediaUrls.find(m => m.content_type?.includes('m4a') || m.url?.endsWith('.m4a'));
      if (m4aEntry?.url) {
        const m4aResult = await browserFetchBinary(m4aEntry.url);
        if (m4aResult.ok) {
          audioFile = path.join(outputDir, safeTitle + '_' + clipId + '.m4a');
          fs.writeFileSync(audioFile, Buffer.from(m4aResult.data, 'base64'));
          source = 'cdn';
        }
      }
      if (!audioFile) {
        throw new CliError('DOWNLOAD_ERROR', 'm4a download failed: no m4a URL in media_urls');
      }
    }

    // If WAV is requested, try media_urls first, then fallback to CDN
    if (format === 'wav' && !audioFile) {
      const wavEntry = mediaUrls.find(m => m.content_type?.includes('wav') || m.url?.endsWith('.wav'));
      if (wavEntry?.url) {
        const wavResult = await browserFetchBinary(wavEntry.url);
        if (wavResult.ok) {
          audioFile = path.join(outputDir, safeTitle + '_' + clipId + '.wav');
          fs.writeFileSync(audioFile, Buffer.from(wavResult.data, 'base64'));
          source = 'cdn';
        }
      }
      if (!audioFile) {
        const wavUrl = 'https://cdn1.suno.ai/' + clipId + '.wav';
        const wavResult = await browserFetchBinary(wavUrl);
        if (wavResult.ok) {
          audioFile = path.join(outputDir, safeTitle + '_' + clipId + '.wav');
          fs.writeFileSync(audioFile, Buffer.from(wavResult.data, 'base64'));
          source = 'cdn';
        } else {
          console.warn('[download] WAV CDN download failed: ' + (wavResult.status || wavResult.err) + ', falling back to MP3');
        }
      }
    }

    // Fallback: MP3 from CDN (also default for --audio-format mp3)
    if (!audioFile) {
      let mp3Url = '';
      const mp3Entry = mediaUrls.find(m => m.content_type?.includes('mp3') || m.url?.endsWith('.mp3'));
      if (mp3Entry?.url) {
        mp3Url = mp3Entry.url;
      } else {
        mp3Url = 'https://cdn1.suno.ai/' + clipId + '.mp3';
      }
      const audioResult = await browserFetchBinary(mp3Url);
      if (!audioResult.ok) {
        throw new CliError('DOWNLOAD_ERROR', 'audio download failed: ' + (audioResult.status || audioResult.err));
      }
      audioFile = path.join(outputDir, safeTitle + '_' + clipId + '.mp3');
      fs.writeFileSync(audioFile, Buffer.from(audioResult.data, 'base64'));
      actualFormat = 'mp3';
      source = 'cdn';
    }

    return [{
      id: clipId,
      title,
      audio_file: audioFile,
      cover_file: coverFile,
      lyrics_file: lyricsFile,
      duration,
      format: actualFormat,
      source,
    }];
  },
});
