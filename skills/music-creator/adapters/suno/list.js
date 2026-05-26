/**
 * suno list — list all songs in your Suno library.
 *
 * Opens suno.com/me and extracts clip IDs + titles from the page.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError, AuthRequiredError } from '@jackwener/opencli/errors';

cli({
  site: 'suno',
  name: 'list',
  description: '列出 Suno 账号下的所有歌曲（标题 + Clip ID）',
  access: 'read',
  domain: 'suno.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'limit',
      type: 'int',
      default: 50,
      help: '最多返回多少首（默认 50，Suno 页面可能懒加载更多）',
    },
  ],
  columns: ['rank', 'title', 'id', 'duration', 'status'],
  func: async (page, args) => {
    // 1. Open profile page
    await page.goto('https://suno.com/me');
    await page.wait(5);

    // 2. Get Clerk token
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

    // 3. Try API first (reliable), fallback to DOM scraping
    let songs = [];
    
    // API approach: get user profile ID then fetch creations
    const profileRaw = await page.evaluate(`
      (async () => {
        try {
          const resp = await fetch('https://studio-api-prod.suno.com/api/profiles/me', {
            headers: { Authorization: 'Bearer ${sess.token}' }
          });
          const data = await resp.json();
          return JSON.stringify({ ok: true, data });
        } catch (e) {
          return JSON.stringify({ ok: false, err: String(e) });
        }
      })()
    `);
    const profileResult = JSON.parse(profileRaw);
    
    if (profileResult.ok && profileResult.data?.id) {
      const userId = profileResult.data.id;
      const limit = Math.min(args.limit || 50, 100);
      
      // Fetch user's creations
      const creationsRaw = await page.evaluate(`
        (async () => {
          try {
            const resp = await fetch('https://studio-api-prod.suno.com/api/creations/${userId}?page=0&num_results=${limit}', {
              headers: { Authorization: 'Bearer ${sess.token}' }
            });
            const data = await resp.json();
            return JSON.stringify({ ok: true, data });
          } catch (e) {
            return JSON.stringify({ ok: false, err: String(e) });
          }
        })()
      `);
      const creationsResult = JSON.parse(creationsRaw);
      
      if (creationsResult.ok && creationsResult.data?.creations) {
        songs = creationsResult.data.creations.map((c, i) => ({
          rank: i + 1,
          title: String(c.title || 'Untitled'),
          id: String(c.id || ''),
          duration: Number(c.duration || 0),
          status: String(c.status || ''),
        })).filter(s => s.id);
      }
    }

    // Fallback: DOM scraping if API fails
    if (songs.length === 0) {
      const domSongs = await page.evaluate(`
        (() => {
          const items = [];
          const cards = document.querySelectorAll('[data-testid="creation-card"], .creation-card, [class*="song"], article');
          cards.forEach((card, i) => {
            const link = card.querySelector('a[href*="/song/"]');
            if (!link) return;
            const match = link.href.match(/\\/song\\/([a-f0-9-]{36})/);
            if (!match) return;
            const titleEl = card.querySelector('h3, h4, [class*="title"], [data-testid="title"]');
            items.push({
              rank: i + 1,
              title: titleEl?.innerText?.trim() || 'Untitled',
              id: match[1],
              duration: 0,
              status: '',
            });
          });
          return items;
        })()
      `);
      songs = domSongs.slice(0, args.limit);
    }

    if (songs.length === 0) {
      throw new CliError('NO_DATA', 'No songs found. Make sure you are logged in and have songs in your library.');
    }

    return songs;
  },
});
