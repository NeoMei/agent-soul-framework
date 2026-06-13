/**
 * suno generate-wav — trigger WAV generation/download via Suno Web UI.
 *
 * Strategy: UI (browser) — navigates to Library page, opens song menu,
 * selects Download → WAV Audio, and captures the download.
 *
 * Flow:
 *   1. Navigate to suno.com/me (Library page)
 *   2. Find the target song card by clip ID or title
 *   3. Click the "..." (More options) button on the song card
 *   4. Click "Download" in the menu
 *   5. Click "WAV Audio" in the submenu
 *   6. Wait for "Download WAV Audio" dialog to appear
 *   7. Click "Download File" button
 *   8. Capture the download URL and download via browser fetch
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError, AuthRequiredError } from '@jackwener/opencli/errors';
import * as fs from 'fs';
import * as path from 'path';

const SUNO_API = 'https://studio-api-prod.suno.com';

cli({
  site: 'suno',
  name: 'generate-wav',
  description: '通过 Suno Web UI 的 Library 页面生成并下载 WAV 音频（需要 Pro 订阅）',
  access: 'write',
  domain: 'suno.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'id',
      positional: true,
      required: true,
      type: 'string',
      help: 'Suno clip ID（如 45fdb007-bcd4-485f-9a7c-4b38f8d96324）',
    },
    {
      name: 'output-dir',
      type: 'string',
      default: '',
      help: '输出目录（默认 ~/openclaw/media/inbound/）',
    },
  ],
  columns: ['id', 'title', 'audio_file', 'cover_file', 'lyrics_file', 'duration', 'format', 'source'],
  func: async (page, args) => {
    const clipId = String(args.id ?? '').trim();
    if (!clipId) {
      throw new CliError('INVALID_ARGUMENT', 'clip id is required');
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

    // ── 1. Navigate to Library page ──
    console.log('[generate-wav] Navigating to Library page...');
    await page.goto('https://suno.com/me');
    await page.wait(5);

    // ── 2. Get Clerk token ──
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

    // ── 3. Fetch clip details ──
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

    // ── 4. Download cover ──
    let coverFile = '';
    if (coverUrl) {
      const coverExt = coverUrl.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] || 'jpg';
      coverFile = path.join(outputDir, safeTitle + '_' + clipId + '_cover.' + coverExt);
      const coverResult = await browserFetchBinary(coverUrl);
      if (coverResult.ok) {
        fs.writeFileSync(coverFile, Buffer.from(coverResult.data, 'base64'));
      } else {
        console.warn('[generate-wav] Cover download failed: ' + (coverResult.status || coverResult.err));
        coverFile = '';
      }
    }

    // ── 5. Save lyrics ──
    let lyricsFile = '';
    if (lyrics) {
      lyricsFile = path.join(outputDir, safeTitle + '_' + clipId + '_lyrics.txt');
      fs.writeFileSync(lyricsFile, lyrics, 'utf-8');
    }

    // ── 6. Navigate to Library and find the song's "More options" button ──
    console.log('[generate-wav] Looking for song in Library...');
    
    // Wait longer for Library page to fully load (React SPA may take time)
    await page.wait(10);
    
    // Find the song's "More options" button by matching clip ID position
    const moreBtnResult = await page.evaluate(`
      (() => {
        const clipId = '${clipId}';
        
        // Find the song link
        const links = document.querySelectorAll('a[href*="/song/"]');
        let targetLink = null;
        for (const link of links) {
          if (link.href.includes(clipId)) {
            targetLink = link;
            break;
          }
        }
        
        if (!targetLink) {
          // Strategy 2: Find by any element containing clip ID text
          const allElements = document.querySelectorAll('*');
          for (const el of allElements) {
            if (el.textContent && el.textContent.includes(clipId)) {
              let card = el.closest('[data-testid], [role="listitem"], article, .card');
              if (!card) card = el.parentElement?.parentElement?.parentElement;
              if (card) {
                targetLink = card.querySelector('a') || card;
                break;
              }
            }
          }
        }
        
        if (!targetLink) {
          // Debug: report what we found
          const allHrefs = Array.from(document.querySelectorAll('a[href*="/song/"]')).map(a => a.href).slice(0, 5);
          return JSON.stringify({ ok: false, err: 'Song not found in Library', debug: { sampleHrefs: allHrefs } });
        }
        
        // Get the Y position of the song
        const linkRect = targetLink.getBoundingClientRect();
        const linkY = linkRect.y;
        
        // Find all "More options" buttons and match by Y position
        const allMoreButtons = document.querySelectorAll('button[aria-label="More options"]');
        let closestBtn = null;
        let minDistance = Infinity;
        
        for (const btn of allMoreButtons) {
          const btnRect = btn.getBoundingClientRect();
          const distance = Math.abs(btnRect.y - linkY);
          if (distance < minDistance) {
            minDistance = distance;
            closestBtn = btn;
          }
        }
        
        if (!closestBtn) {
          return JSON.stringify({ ok: false, err: 'More options button not found' });
        }
        
        // Return element info for CDP click
        const btnRect = closestBtn.getBoundingClientRect();
        return JSON.stringify({ 
          ok: true, 
          method: 'matched-by-position',
          x: btnRect.left + btnRect.width / 2,
          y: btnRect.top + btnRect.height / 2
        });
      })()
    `);
    const findResult = JSON.parse(moreBtnResult);
    if (!findResult.ok) {
      console.warn('[generate-wav] Find song in Library failed:', findResult);
      // Fallback: skip Library UI navigation, try direct CDN download
      console.log('[generate-wav] Library not available, skipping UI navigation...');
    } else {
    
    // Click using proper mouse events for React compatibility
    const clickResult = await page.evaluate(`
      (() => {
        const clipId = '${clipId}';
        
        // Find the song link
        const links = document.querySelectorAll('a[href*="/song/"]');
        let targetLink = null;
        for (const link of links) {
          if (link.href.includes(clipId)) {
            targetLink = link;
            break;
          }
        }
        
        if (!targetLink) {
          return JSON.stringify({ ok: false, err: 'Song not found' });
        }
        
        // Get the Y position of the song
        const linkRect = targetLink.getBoundingClientRect();
        const linkY = linkRect.y;
        
        // Find all "More options" buttons and match by Y position
        const allMoreButtons = document.querySelectorAll('button[aria-label="More options"]');
        let closestBtn = null;
        let minDistance = Infinity;
        
        for (const btn of allMoreButtons) {
          const btnRect = btn.getBoundingClientRect();
          const distance = Math.abs(btnRect.y - linkY);
          if (distance < minDistance) {
            minDistance = distance;
            closestBtn = btn;
          }
        }
        
        if (!closestBtn) {
          return JSON.stringify({ ok: false, err: 'More options button not found' });
        }
        
        // Right-click to open context menu (React requires contextmenu event)
        const rect = closestBtn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        
        closestBtn.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y,
          button: 2
        }));
        
        return JSON.stringify({ ok: true });
      })()
    `);
    const clickRes = JSON.parse(clickResult);
    if (!clickRes.ok) {
      throw new CliError('UI_ERROR', clickRes.err);
    }
    console.log('[generate-wav] Clicked More options button');
    await page.wait(2);
    
    // ── 7. Hover over "Download" to reveal submenu ──
    const hoverResult = await page.evaluate(`
      (() => {
        // Find the Download button by text content
        const buttons = Array.from(document.querySelectorAll('button'));
        const downloadBtn = buttons.find(btn => {
          const text = (btn.innerText || btn.textContent || '').trim();
          return text === 'Download';
        });
        
        if (!downloadBtn) {
          return JSON.stringify({ ok: false, err: 'Download button not found' });
        }
        
        // Trigger mouseenter to show submenu
        const mouseenter = new MouseEvent('mouseenter', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        downloadBtn.dispatchEvent(mouseenter);
        
        const mouseover = new MouseEvent('mouseover', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        downloadBtn.dispatchEvent(mouseover);
        
        return JSON.stringify({ ok: true });
      })()
    `);
    const hover = JSON.parse(hoverResult);
    if (!hover.ok) {
      console.warn('[generate-wav] Hover failed:', hover);
      throw new CliError('UI_ERROR', hover.err);
    }
    
    console.log('[generate-wav] Hovered over Download');
    await page.wait(3);
    
    // ── 8. Click "WAV Audio" in the submenu ──
    const wavClickResult = await page.evaluate(`
      (() => {
        // Find WAV Audio button by aria-label
        const wavBtn = document.querySelector('button[aria-label="WAV Audio"]');
        
        if (!wavBtn) {
          return JSON.stringify({ ok: false, err: 'WAV Audio button not found' });
        }
        
        // Dispatch proper mouse events
        const rect = wavBtn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        
        ['mousedown', 'mouseup', 'click'].forEach(eventType => {
          const event = new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y
          });
          wavBtn.dispatchEvent(event);
        });
        
        return JSON.stringify({ ok: true });
      })()
    `);
    const wavClick = JSON.parse(wavClickResult);
    if (!wavClick.ok) {
      console.warn('[generate-wav] WAV click failed:', wavClick);
      throw new CliError('UI_ERROR', wavClick.err);
    }
    
    console.log('[generate-wav] Clicked WAV Audio');
    await page.wait(5);
    
    // ── 9. Click "Download File" in the dialog ──
    const dialogResult = await page.evaluate(`
      (() => {
        // Find Download File button in dialog
        // The button may have the text inside a child span
        const buttons = Array.from(document.querySelectorAll('button'));
        const downloadFileBtn = buttons.find(btn => {
          const text = (btn.innerText || btn.textContent || '').trim();
          return text.includes('Download File');
        });
        
        if (!downloadFileBtn) {
          return JSON.stringify({ ok: false, err: 'Download File button not found' });
        }
        
        // Dispatch proper mouse events
        const rect = downloadFileBtn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        
        ['mousedown', 'mouseup', 'click'].forEach(eventType => {
          const event = new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y
          });
          downloadFileBtn.dispatchEvent(event);
        });
        
        return JSON.stringify({ ok: true });
      })()
    `);
    const dialog = JSON.parse(dialogResult);
    if (!dialog.ok) {
      console.warn('[generate-wav] Dialog click failed:', dialog);
      throw new CliError('UI_ERROR', dialog.err);
    }
    
    console.log('[generate-wav] Clicked Download File');
    }
    
    // ── 10. Wait for generation and check if WAV is available ──
    console.log('[generate-wav] Waiting for WAV generation...');
    await page.wait(10);
    
    // Re-fetch clip details to check if media_urls now includes WAV
    const checkWavResult = await page.evaluate(`
      (async () => {
        try {
          const resp = await fetch('${SUNO_API}/api/feed/v2?ids=${encodeURIComponent(clipId)}', {
            headers: { Authorization: 'Bearer ${sess.token}' }
          });
          const data = await resp.json();
          const clip = data?.clips?.[0];
          const mediaUrls = clip?.media_urls || [];
          const wavUrl = mediaUrls.find(u => u.content_type?.includes('wav'))?.url;
          return JSON.stringify({ ok: true, hasWav: !!wavUrl, wavUrl: wavUrl || '' });
        } catch (e) {
          return JSON.stringify({ ok: false, err: String(e) });
        }
      })()
    `);
    const checkWav = JSON.parse(checkWavResult);
    
    let audioFile = '';
    let actualFormat = 'mp3';
    
    if (checkWav.ok && checkWav.hasWav && checkWav.wavUrl) {
      console.log('[generate-wav] WAV is available, downloading...');
      const wavResult = await browserFetchBinary(checkWav.wavUrl);
      if (wavResult.ok) {
        audioFile = path.join(outputDir, safeTitle + '_' + clipId + '.wav');
        fs.writeFileSync(audioFile, Buffer.from(wavResult.data, 'base64'));
        actualFormat = 'wav';
      } else {
        console.warn('[generate-wav] WAV download failed:', wavResult);
      }
    }
    
    // Fallback to CDN URL if API doesn't have it yet
    if (!audioFile) {
      const wavUrl = 'https://cdn1.suno.ai/' + clipId + '.wav';
      const wavResult = await browserFetchBinary(wavUrl);
      if (wavResult.ok) {
        console.log('[generate-wav] WAV downloaded from CDN');
        audioFile = path.join(outputDir, safeTitle + '_' + clipId + '.wav');
        fs.writeFileSync(audioFile, Buffer.from(wavResult.data, 'base64'));
        actualFormat = 'wav';
      }
    }
    
    // Final fallback to MP3
    if (!audioFile) {
      console.warn('[generate-wav] WAV not available, falling back to MP3');
      const mp3Url = 'https://cdn1.suno.ai/' + clipId + '.mp3';
      const mp3Result = await browserFetchBinary(mp3Url);
      if (!mp3Result.ok) {
        throw new CliError('DOWNLOAD_ERROR', 'Failed to download audio: ' + (mp3Result.status || mp3Result.err));
      }
      audioFile = path.join(outputDir, safeTitle + '_' + clipId + '.mp3');
      fs.writeFileSync(audioFile, Buffer.from(mp3Result.data, 'base64'));
      actualFormat = 'mp3';
    }

    return [{
      id: clipId,
      title,
      audio_file: audioFile,
      cover_file: coverFile,
      lyrics_file: lyricsFile,
      duration,
      format: actualFormat,
      source: 'cdn',
    }];
  },
});
