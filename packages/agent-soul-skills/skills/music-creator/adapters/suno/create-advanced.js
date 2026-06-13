/**
 * suno create-advanced — Suno Advanced (Custom) mode song generation.
 *
 * Strategy: INTERCEPT (same as suno/create.js).
 *
 * What's different from Simple-mode `suno create`:
 *  - Two textareas (lyrics + styles) instead of one description.
 *  - Optional title input at the top of the form.
 *  - Instrumental mode = leave the lyrics textarea blank (Suno removed the
 *    explicit toggle; the lyrics field's own placeholder says
 *    "Write some lyrics or leave blank for instrumental").
 *  - Two Radix UI sliders (Weirdness, Style Influence) under "More Options".
 *    They are <div role="slider"> elements. Synthetic KeyboardEvent dispatch
 *    DOES work, but only if focus is restored on the element each press —
 *    React re-renders steal focus between separate evaluate() calls, so the
 *    walk has to happen inside a single in-page async loop. See setSlider().
 *  - Clip ID detection: feed/v3 responses for Advanced clips have empty
 *    metadata.gpt_description_prompt (that field is Simple-mode only). We
 *    instead match on (user_id === current user) AND (created_at > click time
 *    minus 30s skew) and take the 2 newest.
 *
 * Out of v1 scope:
 *  - Model selection (the "v5.5" badge near the top doesn't open a clean
 *    selector — defaults to v5.5 which is what most users want).
 *  - Audio Influence slider (only appears after uploading reference audio).
 *  - Persona / Vocal Gender / Lyrics Mode / BPM / Key / Section type.
 *
 * Login: requires user to be logged in to suno.com in main Chrome.
 * Each generation costs 10 Suno credits and produces 2 song variants.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError, AuthRequiredError } from '@jackwener/opencli/errors';

const SUNO_API = 'https://studio-api-prod.suno.com';
const FEED_V3_PATTERN = 'studio-api-prod.suno.com/api/feed/v3';
const TERMINAL_STATUSES = new Set(['complete', 'error']);

cli({
  site: 'suno',
  name: 'create-advanced',
  description: '触发 Suno Advanced 模式生成（自己写歌词 + 风格 + 可选标题/滑杆）',
  access: 'write',
  domain: 'studio-api-prod.suno.com',
  strategy: Strategy.INTERCEPT,
  args: [
    {
      name: 'styles',
      required: true,
      type: 'string',
      help: '风格 / 流派描述（自然语言，可写长文本，如 "Mandarin pop rock ballad, warm low-pitched male vocal, baritone range..."）',
    },
    {
      name: 'lyrics',
      type: 'string',
      help: '完整歌词文本（含 [Verse]/[Chorus] 等结构标签）。--instrumental 模式下应留空',
    },
    {
      name: 'title',
      type: 'string',
      help: '歌曲标题（不传 Suno 自动生成）',
    },
    {
      name: 'instrumental',
      type: 'bool',
      default: false,
      help: '纯音乐模式（清空 lyrics 字段）。与 --lyrics 互斥',
    },
    {
      name: 'weirdness',
      type: 'int',
      help: 'Weirdness 滑杆 0-100（不传保持页面当前值）',
    },
    {
      name: 'style-influence',
      type: 'int',
      help: 'Style Influence 滑杆 0-100（不传保持页面当前值）',
    },
    {
      name: 'timeout',
      type: 'int',
      default: 420,
      help: '等待生成完成最大秒数（默认 420 = 7 分钟，最大 900）',
    },
    {
      name: 'no-translate',
      type: 'bool',
      default: false,
      help: '跳过 styles 中文检测（默认如果 styles 含中文会报错要求先翻译成英文）',
    },
    {
      name: 'enhance-lyrics',
      type: 'string',
      help: 'Enhance lyrics 描述（如 "make it sound happier"）',
    },
    {
      name: 'exclude-styles',
      type: 'string',
      help: 'Exclude styles — 排除不想要风格',
    },
    {
      name: 'vocal-gender',
      type: 'string',
      help: '人声性别：male / female（不传保持页面当前值）',
    },
    {
      name: 'lyrics-mode',
      type: 'string',
      help: '歌词模式：manual（手动分段）/ auto（自动分段）（不传保持页面当前值）',
    },
  ],
  columns: ['index', 'id', 'title', 'audio_url', 'image_url', 'duration', 'status'],
  func: async (page, args) => {
    const styles = String(args.styles ?? '').trim();
    if (!styles) throw new CliError('INVALID_ARGUMENT', 'styles is required');

    // Suno's styles textarea expects English for best results.
    // If Chinese is detected, ask the calling agent to translate first.
    if (!args['no-translate'] && hasCjk(styles)) {
      throw new CliError(
        'TRANSLATE_REQUIRED',
        `styles contains Chinese text. Please translate the following into English first, then retry:\n${styles}`
      );
    }

    const lyrics = args.lyrics != null ? String(args.lyrics) : '';
    const instrumental = args.instrumental === true;
    if (instrumental && lyrics.trim()) {
      throw new CliError('INVALID_ARGUMENT', '--instrumental 与 --lyrics 互斥：纯音乐模式不应传 lyrics');
    }
    if (!instrumental && !lyrics.trim()) {
      throw new CliError('INVALID_ARGUMENT', '非 --instrumental 模式下 --lyrics 必填');
    }

    const title = args.title ? String(args.title).trim() : '';
    const enhanceLyrics = args['enhance-lyrics'] ? String(args['enhance-lyrics']).trim() : '';
    const excludeStyles = args['exclude-styles'] ? String(args['exclude-styles']).trim() : '';

    const vocalGenderRaw = args['vocal-gender'] ? String(args['vocal-gender']).trim().toLowerCase() : '';
    if (vocalGenderRaw && !['male', 'female'].includes(vocalGenderRaw)) {
      throw new CliError('INVALID_ARGUMENT', '--vocal-gender must be male or female');
    }
    const vocalGender = vocalGenderRaw || null;

    const lyricsModeRaw = args['lyrics-mode'] ? String(args['lyrics-mode']).trim().toLowerCase() : '';
    if (lyricsModeRaw && !['manual', 'auto'].includes(lyricsModeRaw)) {
      throw new CliError('INVALID_ARGUMENT', '--lyrics-mode must be manual or auto');
    }
    const lyricsMode = lyricsModeRaw || null;

    const parseSlider = (v) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        throw new CliError('INVALID_ARGUMENT', `slider value must be a number 0-100: ${v}`);
      }
      return Math.max(0, Math.min(100, Math.round(n)));
    };
    const weirdness = parseSlider(args.weirdness);
    const styleInfluence = parseSlider(args['style-influence']);

    const timeoutS = Math.max(60, Math.min(Number(args.timeout) || 420, 900));

    // 1. Navigate first. Interceptor patches are page-scoped and goto wipes
    //    them, so we install AFTER navigation, just before the Create click.
    await page.goto('https://suno.com/create');
    await page.wait(5);

    // 2. Confirm Clerk session is alive AND fetch the Suno-internal user_id.
    //    Note: window.Clerk.user.id is the Clerk identity-service ID
    //    (e.g. "user_2e9zlgd..."), but feed/v3 clips carry a different
    //    Suno-internal user_id (UUID). We need the latter to filter clips
    //    in step 9. /api/user/me/ returns it.
    const sessRaw = await page.evaluate(`
      (async () => {
        if (!window.Clerk?.session) return JSON.stringify({ ok: false });
        try {
          const tok = await window.Clerk.session.getToken();
          if (!tok) return JSON.stringify({ ok: false });
          const r = await fetch('${SUNO_API}/api/user/me/', {
            headers: { Authorization: 'Bearer ' + tok },
          });
          if (!r.ok) return JSON.stringify({ ok: false, err: 'user/me HTTP ' + r.status });
          const d = await r.json();
          return JSON.stringify({ ok: true, userId: d.user_id || null });
        } catch (e) {
          return JSON.stringify({ ok: false, err: String(e) });
        }
      })()
    `);
    const sess = JSON.parse(sessRaw);
    if (!sess.ok || !sess.userId) throw new AuthRequiredError('suno.com');
    const userId = sess.userId;

    // 3. Switch to Advanced tab if not already.
    const modeRaw = await page.evaluate(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('button')).filter(
          b => ['Simple', 'Advanced', 'Sounds'].includes(b.textContent?.trim())
        );
        const active = tabs.find(b => b.className.includes('active'));
        return JSON.stringify({ active: active?.textContent?.trim() || null });
      })()
    `);
    const mode = JSON.parse(modeRaw);
    if (mode.active !== 'Advanced') {
      const tagRaw = await page.evaluate(`
        (() => {
          const btn = Array.from(document.querySelectorAll('button')).find(
            b => b.textContent?.trim() === 'Advanced'
          );
          if (!btn) return JSON.stringify({ ok: false, err: 'Advanced tab not found' });
          btn.setAttribute('data-opencli-ref', '__suno_adv__');
          return JSON.stringify({ ok: true });
        })()
      `);
      const tag = JSON.parse(tagRaw);
      if (!tag.ok) throw new CliError('UI_ERROR', tag.err || 'Advanced tab not found');
      await page.click('[data-opencli-ref="__suno_adv__"]');
      await page.wait(1);
    }

    // 4. Fill lyrics and styles textareas via React-aware native value setter.
    //    In Advanced mode there are 2 visible textareas (in DOM order: lyrics
    //    first, styles second); the other two (Simple description, Sounds)
    //    are kept in the DOM but display:none on an ancestor.
    const lyricsValue = instrumental ? '' : lyrics;
    const lyricsJson = JSON.stringify(lyricsValue);
    const stylesJson = JSON.stringify(styles);
    const setRaw = await page.evaluate(`
      (() => {
        const all = Array.from(document.querySelectorAll('textarea'));
        const visible = all.filter(t => {
          const cs = getComputedStyle(t);
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
          let p = t.parentElement;
          while (p && p !== document.body) {
            const pcs = getComputedStyle(p);
            if (pcs.display === 'none' || pcs.visibility === 'hidden') return false;
            p = p.parentElement;
          }
          return true;
        });
        // Suno may show 3+ visible textareas in Advanced mode (lyrics, styles, AI-lyrics, etc.)
        // Locate by placeholder keywords instead of hardcoding count/order.
        const lyricsTa = visible.find(t => {
          const ph = (t.placeholder || '').toLowerCase();
          return ph.includes('lyrics') || ph.includes('instrumental');
        });
        const aiLyricsTa = visible.find(t => {
          const ph = (t.placeholder || '').toLowerCase();
          return ph.includes('describe the lyrics') || ph.includes('write new lyrics') || ph.includes('theme or topic');
        });
        const stylesTa = visible.find(t => t !== lyricsTa && t !== aiLyricsTa);
        if (!lyricsTa) {
          return JSON.stringify({ ok: false, err: 'lyrics textarea not found among ' + visible.length + ' visible textareas; placeholders: ' + visible.map(t => t.placeholder || '').join(' | ') });
        }
        if (!stylesTa) {
          return JSON.stringify({ ok: false, err: 'styles textarea not found among ' + visible.length + ' visible textareas; placeholders: ' + visible.map(t => t.placeholder || '').join(' | ') });
        }
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(lyricsTa, ${lyricsJson});
        lyricsTa.dispatchEvent(new Event('input', { bubbles: true }));
        lyricsTa.dispatchEvent(new Event('change', { bubbles: true }));
        setter.call(stylesTa, ${stylesJson});
        stylesTa.dispatchEvent(new Event('input', { bubbles: true }));
        stylesTa.dispatchEvent(new Event('change', { bubbles: true }));
        return JSON.stringify({ ok: true, lyricsValue: lyricsTa.value, stylesValue: stylesTa.value });
      })()
    `);
    const setRes = JSON.parse(setRaw);
    if (!setRes.ok) throw new CliError('UI_ERROR', setRes.err || 'failed to set textareas');
    if (setRes.lyricsValue !== lyricsValue) {
      throw new CliError('UI_ERROR', 'lyrics did not stick in textarea (React state mismatch)');
    }
    if (setRes.stylesValue !== styles) {
      throw new CliError('UI_ERROR', 'styles did not stick in textarea (React state mismatch)');
    }

    // 5. Set title (optional). The same Song Title input may be rendered
    //    twice in the DOM (form header + a duplicated panel deeper down);
    //    take the visible top-most occurrence.
    if (title) {
      const titleJson = JSON.stringify(title);
      const titleRaw = await page.evaluate(`
        (() => {
          const inputs = Array.from(document.querySelectorAll('input'))
            .filter(i => i.type === 'text' && (i.placeholder || '').toLowerCase().includes('song title'))
            .filter(i => {
              const r = i.getBoundingClientRect();
              if (r.width < 30 || r.height < 10) return false;
              let p = i.parentElement;
              while (p && p !== document.body) {
                const cs = getComputedStyle(p);
                if (cs.display === 'none' || cs.visibility === 'hidden') return false;
                p = p.parentElement;
              }
              return true;
            });
          if (inputs.length === 0) {
            return JSON.stringify({ ok: false, err: 'Song Title input not found' });
          }
          // Top-most by Y (the form usually has a duplicate panel further down)
          inputs.sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y);
          const input = inputs[0];
          input.scrollIntoView({ block: 'center' });
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, ${titleJson});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return JSON.stringify({ ok: true, value: input.value });
        })()
      `);
      const titleRes = JSON.parse(titleRaw);
      if (!titleRes.ok) throw new CliError('UI_ERROR', titleRes.err || 'failed to set title');
      if (titleRes.value !== title) throw new CliError('UI_ERROR', 'title did not stick');
    }

    // 5.5. Set More Options fields.
    if (enhanceLyrics) {
      await setInputByPlaceholder(page, 'enhance lyrics', enhanceLyrics);
    }
    if (excludeStyles) {
      await setInputByPlaceholder(page, 'exclude styles', excludeStyles);
    }
    if (vocalGender) {
      await toggleButton(page, vocalGender === 'male' ? 'Male' : 'Female');
    }
    if (lyricsMode) {
      await toggleButton(page, lyricsMode === 'manual' ? 'Manual' : 'Auto');
    }

    // 6. Set sliders (closed-loop CDP arrow keys until aria-valuenow matches).
    if (weirdness !== null) {
      await setSlider(page, 'Weirdness', weirdness);
    }
    if (styleInfluence !== null) {
      await setSlider(page, 'Style Influence', styleInfluence);
    }

    // 7. Install interceptor + capture click time. Both must happen RIGHT
    //    before the Create click — interceptor must be post-goto, and we
    //    need the click time to filter out unrelated clips in feed/v3.
    await page.installInterceptor(FEED_V3_PATTERN);
    await page.getInterceptedRequests();
    const clickTimeMs = Date.now();

    // 8. Click "Create song" via CDP-level page.click(). Synthetic
    //    dispatchEvent does NOT trigger Suno's React onPointerDown handler.
    try {
      await page.click('button[aria-label="Create song"]');
    } catch (err) {
      throw new CliError('UI_ERROR', `Create button click failed: ${err?.message || err}`);
    }

    // 9. Wait for 2 new clips owned by current user with created_at after
    //    clickTime (with 30s skew). Advanced clips have empty
    //    metadata.gpt_description_prompt so we cannot match by description. We
    //    accumulate `byId` across iterations because the page polls feed/v3
    //    every ~3s and each response can include only a subset of clips.
    let clipIds = null;
    const byId = new Map();
    const captureDeadline = Date.now() + 60_000;
    while (Date.now() < captureDeadline) {
      await page.wait(2);
      const captured = await page.getInterceptedRequests();
      for (const resp of captured) {
        const clips = Array.isArray(resp?.clips) ? resp.clips : [];
        for (const c of clips) {
          if (!c?.id) continue;
          if (c.user_id !== userId) continue;
          const t = c.created_at ? new Date(c.created_at).getTime() : 0;
          if (t < clickTimeMs - 30_000) continue;
          byId.set(c.id, c);
        }
      }
      if (byId.size >= 2) {
        const sorted = [...byId.values()].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        clipIds = sorted.slice(0, 2).map((c) => c.id);
        break;
      }
    }
    if (!clipIds || clipIds.length < 2) {
      throw new CliError(
        'NO_DATA',
        'Generation did not start — Create click did not produce 2 new clips in feed/v3 within 60s. Check Suno credits / session / form validity.'
      );
    }

    // 10. Poll for terminal status. Piggyback on the page's own feed/v3 polls
    //     (free, no rate limit); fall back to direct feed/v2 every 15s+ if
    //     captures go stale (e.g. user navigated away from the workspace).
    const pollDeadline = Date.now() + timeoutS * 1000;
    const wantedIds = new Set(clipIds);
    const latestById = new Map();
    let lastDirectFetch = 0;
    let finalClips = null;

    while (Date.now() < pollDeadline) {
      const captured = await page.getInterceptedRequests();
      for (const resp of captured) {
        const clips = Array.isArray(resp?.clips) ? resp.clips : [];
        for (const c of clips) {
          if (c?.id && wantedIds.has(c.id)) latestById.set(c.id, c);
        }
      }
      if (
        latestById.size === wantedIds.size &&
        [...latestById.values()].every((c) => TERMINAL_STATUSES.has(c.status))
      ) {
        finalClips = [...latestById.values()];
        break;
      }
      const sinceLast = Date.now() - lastDirectFetch;
      if (sinceLast > 15000) {
        lastDirectFetch = Date.now();
        const idsParamJson = JSON.stringify(clipIds.join(','));
        const respRaw = await page.evaluate(`
          (async () => {
            try {
              const tok = await window.Clerk.session.getToken();
              const r = await fetch('${SUNO_API}/api/feed/v2?ids=' + ${idsParamJson}, {
                headers: { Authorization: 'Bearer ' + tok },
              });
              if (!r.ok) return JSON.stringify({ err: 'HTTP ' + r.status });
              return JSON.stringify(await r.json());
            } catch (e) {
              return JSON.stringify({ err: String(e) });
            }
          })()
        `);
        const data = JSON.parse(respRaw);
        if (!data.err) {
          for (const c of data.clips || []) {
            if (c?.id && wantedIds.has(c.id)) latestById.set(c.id, c);
          }
          if (
            latestById.size === wantedIds.size &&
            [...latestById.values()].every((c) => TERMINAL_STATUSES.has(c.status))
          ) {
            finalClips = [...latestById.values()];
            break;
          }
        }
      }
      await page.wait(3);
    }

    if (!finalClips) {
      throw new CliError(
        'TIMEOUT',
        `Generation did not complete within ${timeoutS}s. Clip IDs: ${clipIds.join(',')}. Pass --timeout=<larger> and retry, or look up the clips via the Suno UI.`
      );
    }

    const ordered = [...finalClips].sort((a, b) => {
      const ai = Number.isFinite(a?.metadata?.batch_index) ? a.metadata.batch_index : 0;
      const bi = Number.isFinite(b?.metadata?.batch_index) ? b.metadata.batch_index : 0;
      return ai - bi;
    });

    return ordered.map((c, i) => ({
      index: i + 1,
      id: String(c.id || ''),
      title: String(c.title || ''),
      audio_url: String(c.audio_url || ''),
      image_url: String(c.image_url || ''),
      duration: Number(c?.metadata?.duration ?? 0),
      status: String(c.status || ''),
    }));
  },
});

function hasCjk(text) {
  // CJK Unified Ideographs + Extensions A-D + compatibility ideographs
  return /[一-鿿㐀-䶿豈-﫿]/.test(text);
}


/**
 * Closed-loop slider control. Suno's sliders are <div role="slider"> Radix
 * primitives. Per-key synthetic dispatch via page.pressKey() is racy: the
 * page can re-render between the focus call and the next pressKey, and
 * document.activeElement drifts back to the body, sending arrow keys into
 * the void. Verified empirically — running this as separate evaluate() calls
 * left aria-valuenow at its starting value despite ~50 keypresses.
 *
 * Fix: do the full focus + key-dispatch + read-back loop inside a single
 * page.evaluate, so focus cannot be stolen between keys. Each iteration
 * focuses the slider, dispatches keydown+keyup directly on the element
 * (bypassing document.activeElement), waits for React to flush, and reads
 * aria-valuenow to confirm the move. If a key fails to register we retry up
 * to 3 times before giving up on that step.
 */
async function setSlider(page, ariaLabel, targetValue) {
  const js = `
    (async () => {
      const s = Array.from(document.querySelectorAll('[role="slider"]')).find(
        el => el.getAttribute('aria-label') === ${JSON.stringify(ariaLabel)}
      );
      if (!s) return JSON.stringify({ ok: false, err: 'slider not found: ${ariaLabel}' });
      const min = parseInt(s.getAttribute('aria-valuemin') || '0', 10);
      const max = parseInt(s.getAttribute('aria-valuemax') || '100', 10);
      const target = ${Number(targetValue)};
      if (target < min || target > max) {
        return JSON.stringify({ ok: false, err: 'target ' + target + ' out of [' + min + ',' + max + ']' });
      }
      s.scrollIntoView({ block: 'center' });
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const fireKey = (key) => {
        s.focus();
        s.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
        s.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true, cancelable: true }));
      };
      let cur = parseInt(s.getAttribute('aria-valuenow') || '0', 10);
      const startCur = cur;
      const startTarget = target;
      let totalKeys = 0;
      const maxKeys = 250;
      while (cur !== target && totalKeys < maxKeys) {
        const key = cur < target ? 'ArrowRight' : 'ArrowLeft';
        let prev = cur;
        let stuckRetries = 0;
        while (true) {
          fireKey(key);
          totalKeys++;
          await sleep(25);
          const fresh = parseInt(s.getAttribute('aria-valuenow') || '0', 10);
          if (fresh !== prev || stuckRetries >= 3) {
            cur = fresh;
            break;
          }
          stuckRetries++;
          await sleep(75);
          if (totalKeys >= maxKeys) break;
        }
      }
      return JSON.stringify({ ok: true, value: cur, totalKeys, startCur, target: startTarget });
    })()
  `;
  const raw = await page.evaluate(js);
  const res = JSON.parse(raw);
  if (!res.ok) throw new CliError('UI_ERROR', res.err || `slider ${ariaLabel} failed`);
  if (Math.abs(res.value - targetValue) > 1) {
    throw new CliError(
      'UI_ERROR',
      `slider ${ariaLabel} ended at ${res.value}, wanted ${targetValue} (started ${res.startCur}, used ${res.totalKeys} keys)`
    );
  }
}

async function setInputByPlaceholder(page, placeholderSubstr, value) {
  const valJson = JSON.stringify(value);
  const phJson = JSON.stringify(placeholderSubstr.toLowerCase());
  const raw = await page.evaluate(`
    (() => {
      const inputs = Array.from(document.querySelectorAll('input'))
        .filter(i => (i.placeholder || '').toLowerCase().includes(${phJson}))
        .filter(i => {
          const r = i.getBoundingClientRect();
          if (r.width < 30 || r.height < 10) return false;
          let p = i.parentElement;
          while (p && p !== document.body) {
            const cs = getComputedStyle(p);
            if (cs.display === 'none' || cs.visibility === 'hidden') return false;
            p = p.parentElement;
          }
          return true;
        });
      if (inputs.length === 0) {
        return JSON.stringify({ ok: false, err: 'input with placeholder "' + ${phJson} + '" not found' });
      }
      inputs.sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y);
      const input = inputs[0];
      input.scrollIntoView({ block: 'center' });
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${valJson});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return JSON.stringify({ ok: true, value: input.value });
    })()
  `);
  const res = JSON.parse(raw);
  if (!res.ok) throw new CliError('UI_ERROR', res.err || `failed to set input (${placeholderSubstr})`);
  if (res.value !== value) throw new CliError('UI_ERROR', `${placeholderSubstr} did not stick`);
}

async function toggleButton(page, text) {
  const textJson = JSON.stringify(text);
  const raw = await page.evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        b => b.textContent?.trim() === ${textJson}
      );
      if (!btn) return JSON.stringify({ ok: false, err: 'button not found: ' + ${textJson} });
      if (btn.dataset?.selected === 'true') {
        return JSON.stringify({ ok: true, action: 'already-selected' });
      }
      btn.setAttribute('data-opencli-ref', '__btn_' + ${JSON.stringify(text.replace(/[^a-z0-9]/gi, ''))} + '__');
      return JSON.stringify({ ok: true, action: 'click' });
    })()
  `);
  const res = JSON.parse(raw);
  if (!res.ok) throw new CliError('UI_ERROR', res.err);
  if (res.action === 'click') {
    const ref = `__btn_${text.replace(/[^a-z0-9]/gi, '')}__`;
    await page.click(`[data-opencli-ref="${ref}"]`);
    await page.wait(0.3);
  }
}
