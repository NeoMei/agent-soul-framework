/**
 * Shared utilities for suno adapters.
 */

/**
 * Download binary data via browser fetch and return as base64.
 * @param {import('playwright').Page} page
 * @param {string} url
 * @returns {Promise<{ok: boolean, data?: string, status?: number, err?: string}>}
 */
export async function browserFetchBinary(page, url) {
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
