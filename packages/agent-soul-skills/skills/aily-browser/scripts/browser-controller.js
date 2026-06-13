#!/usr/bin/env node
/**
 * Playwright Browser Controller for Diandian
 * 
 * 工作流：
 * 1. 检测 Chrome 是否在 9222 端口运行 → 直接连接
 * 2. 检测桌面 Chrome 是否在运行 → 提示用户关闭后重试
 * 3. 复制默认 profile 到工作目录 → 启动带调试端口的 Chrome → 继承 Cookie
 * 
 * Usage:
 *   node browser-controller.js navigate https://www.example.com
 *   node browser-controller.js screenshot /tmp/page.png
 *   node browser-controller.js snapshot
 *   node browser-controller.js click "selector"
 *   node browser-controller.js eval "document.title"
 */

const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CDP_PORT = 9222;
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;
const DEFAULT_PROFILE = path.join(os.homedir(), '.config', 'google-chrome');
const WORK_PROFILE = path.join(os.homedir(), '.openclaw', 'chrome-profile');

let browser = null;
let page = null;
let useCloak = false;
let cloakModule = null;

function findChrome() {
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    return execSync('which google-chrome || which chromium || which chromium-browser', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function isChromeOnDebugPort() {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

function isDesktopChromeRunning() {
  try {
    const output = execSync('ps aux | grep "google-chrome" | grep -v grep | grep -v "remote-debugging-port" | wc -l', { encoding: 'utf8' });
    return parseInt(output.trim()) > 0;
  } catch {
    return false;
  }
}

function copyProfile() {
  // First-time init only: if a work profile already exists, keep it. The user has
  // logged into sites (Suno etc.) inside the openclaw Chrome window, and those
  // cookies/credentials live ONLY in WORK_PROFILE — re-copying from the main
  // Chrome profile (which doesn't have those logins) would destroy them.
  // To force a fresh copy: `rm -rf ~/.openclaw/chrome-profile` and rerun.
  if (fs.existsSync(path.join(WORK_PROFILE, 'Default'))) {
    console.log('Reusing existing work profile (keeps logins).');
    return;
  }

  console.log('Initializing work profile from default Chrome profile...');

  if (!fs.existsSync(DEFAULT_PROFILE)) {
    throw new Error(`Default Chrome profile not found at ${DEFAULT_PROFILE}. Please run Chrome at least once.`);
  }

  // Copy profile (exclude large cache files)
  const exclude = [
    'Cache', 'Code Cache', 'GPUCache', 'Service Worker',
    'Session Storage', 'IndexedDB', 'File System', 'blob_storage'
  ];

  fs.mkdirSync(WORK_PROFILE, { recursive: true });

  const items = fs.readdirSync(DEFAULT_PROFILE);
  for (const item of items) {
    if (exclude.includes(item)) continue;

    const src = path.join(DEFAULT_PROFILE, item);
    const dst = path.join(WORK_PROFILE, item);

    try {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        execSync(`cp -r "${src}" "${dst}" 2>/dev/null || true`);
      } else {
        fs.copyFileSync(src, dst);
      }
    } catch (e) {
      // Skip files that can't be copied
    }
  }

  console.log('Work profile initialized.');
}

async function startChrome() {
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error('Chrome not found. Please install google-chrome or chromium.');
  }

  // Check if desktop Chrome is running (without debug port)
  if (isDesktopChromeRunning()) {
    console.error('');
    console.error('⚠️  Desktop Chrome is currently running!');
    console.error('');
    console.error('Chrome does not allow adding debug port to an already running instance.');
    console.error('');
    console.error('Please:');
    console.error('  1. Close all Chrome windows');
    console.error('  2. Run this command again');
    console.error('');
    console.error('Or, start Chrome with debug port manually:');
    console.error('  google-chrome --remote-debugging-port=9222');
    console.error('');
    throw new Error('Desktop Chrome is running. Please close it first.');
  }

  // Copy profile before starting
  copyProfile();

  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${WORK_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,720',
    '--start-maximized',
  ];

  // Linux Chrome ignores HTTPS_PROXY/HTTP_PROXY env; must pass --proxy-server explicitly.
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'agent-browser.json'), 'utf8'));
    if (cfg.proxy) args.push(`--proxy-server=${cfg.proxy}`);
    if (cfg.proxyBypass) args.push(`--proxy-bypass-list=${cfg.proxyBypass}`);
  } catch (_) {}

  const env = { ...process.env };
  delete env.ALL_PROXY;
  delete env.all_proxy;

  console.log('Starting Chrome with copied profile...');
  const proc = spawn(chromePath, args, {
    detached: true,
    stdio: 'ignore',
    env,
  });
  proc.unref();

  // Wait for Chrome to be ready
  const startTime = Date.now();
  while (Date.now() - startTime < 20000) {
    const running = await isChromeOnDebugPort();
    if (running) {
      console.log('Chrome started successfully.');
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Chrome failed to start within 20 seconds.');
}

async function ensureConnected() {
  if (!browser) {
    if (useCloak) {
      // CloakBrowser 模式：启动反检测浏览器
      if (!cloakModule) {
        try {
          cloakModule = await import('cloakbrowser');
        } catch (e) {
          throw new Error(`Failed to load cloakbrowser: ${e.message}. Run: npm install cloakbrowser`);
        }
      }
      console.log('🛡️  Launching CloakBrowser (stealth mode)...');
      const ctx = await cloakModule.launchPersistentContext({
        userDataDir: WORK_PROFILE,
        headless: false,
        args: [`--remote-debugging-port=${CDP_PORT}`],
      });
      browser = ctx; // BrowserContext 对象
      page = ctx.pages()[0];
      if (!page) {
        page = await ctx.newPage();
      }
      console.log('🛡️  CloakBrowser launched with anti-detection patches.');
      return page;
    }

    // 原有 Chrome CDP 模式
    const running = await isChromeOnDebugPort();
    if (!running) {
      await startChrome();
    }
    browser = await chromium.connectOverCDP(CDP_URL);
    const context = browser.contexts()[0];

    // 设置 User-Agent 绕过反爬虫
    await context.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    // Skip chrome:// internal pages — navigating them to https:// causes Chrome to
    // spawn a fresh background tab, leaving the user staring at chrome://new-tab-page/.
    // Prefer the first real http(s)/about page; otherwise open a brand-new one.
    const pages = context.pages().filter(p => !p.url().startsWith('chrome://'));
    page = pages[0];
    if (!page) {
      page = await context.newPage();
    }
  }
  return page;
}

async function navigate(url) {
  const p = await ensureConnected();
  try { await p.bringToFront(); } catch (_) {}
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  // Suno (and most SPAs) never reach 'networkidle' because of WebSocket/telemetry.
  // Cap the wait, then give React/Next a beat to actually paint visible content
  // before we hand control back — otherwise the user sees skeleton placeholders.
  try {
    await p.waitForLoadState('networkidle', { timeout: 8000 });
  } catch (_) {}
  await p.waitForTimeout(2500);
  try { await p.bringToFront(); } catch (_) {}
  console.log('Navigated to:', url);
  console.log('Title:', await p.title());
}

async function takeScreenshot(path) {
  const p = await ensureConnected();
  await p.screenshot({ path, fullPage: true });
  console.log('Screenshot saved to:', path);
}

async function getSnapshot() {
  const p = await ensureConnected();
  const elements = await p.evaluate(() => {
    const results = [];
    const all = document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"]');
    all.forEach((el, i) => {
      const text = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || '').trim().substring(0, 50);
      const tag = el.tagName.toLowerCase();
      const type = el.type || '';
      const href = el.href || '';
      if (text || tag === 'input' || tag === 'textarea') {
        results.push({ ref: `e${i+1}`, tag, type, text, href });
      }
    });
    return results;
  });
  
  console.log('Page snapshot:');
  console.log('URL:', p.url());
  console.log('Title:', await p.title());
  console.log('---');
  elements.forEach(e => {
    let line = `- [${e.ref}] ${e.tag}`;
    if (e.type) line += ` type="${e.type}"`;
    if (e.text) line += ` text="${e.text}"`;
    if (e.href) line += ` href="${e.href}"`;
    console.log(line);
  });
}

async function clickElement(selector) {
  const p = await ensureConnected();
  if (selector.startsWith('@e')) {
    const index = parseInt(selector.substring(2)) - 1;
    const elements = await p.locator('a, button, input, textarea, select, [role="button"], [role="link"]').all();
    if (elements[index]) {
      await elements[index].click();
      console.log('Clicked element @', selector);
      return;
    }
  }
  await p.click(selector);
  console.log('Clicked:', selector);
}

async function typeText(selector, text) {
  const p = await ensureConnected();
  if (selector.startsWith('@e')) {
    const index = parseInt(selector.substring(2)) - 1;
    const elements = await p.locator('input, textarea, [contenteditable]').all();
    if (elements[index]) {
      await elements[index].fill(text);
      console.log('Typed into', selector);
      return;
    }
  }
  await p.fill(selector, text);
  console.log('Typed into:', selector);
}

async function evaluateJs(expression) {
  const p = await ensureConnected();
  const result = await p.evaluate(expression);
  console.log(JSON.stringify(result));
}

async function scrollPage(direction) {
  const p = await ensureConnected();
  if (direction === 'down') {
    await p.evaluate(() => window.scrollBy(0, 800));
  } else if (direction === 'up') {
    await p.evaluate(() => window.scrollBy(0, -800));
  } else if (direction === 'bottom') {
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  } else if (direction === 'top') {
    await p.evaluate(() => window.scrollTo(0, 0));
  }
  console.log('Scrolled:', direction);
}

async function waitMs(ms) {
  await new Promise(r => setTimeout(r, parseInt(ms)));
  console.log('Waited:', ms, 'ms');
}

async function createSunoSong(description) {
  const p = await ensureConnected();
  
  // Navigate to Suno home page
  await p.goto('https://suno.com', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('On Suno home page');
  
  // Dismiss cookie modal if present
  await p.evaluate(() => {
    const allowBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Allow All'));
    if (allowBtn) allowBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  
  // Use React onChange to fill textarea and enable Create button
  await p.evaluate((desc) => {
    const ta = document.getElementById('simple-create-textarea');
    if (!ta) throw new Error('Suno textarea not found');
    
    // Find React props key
    const reactKey = Object.keys(ta).find(k => k.includes('__reactProps'));
    if (!reactKey) throw new Error('React props not found');
    
    const props = ta[reactKey];
    
    // Set value
    ta.value = desc;
    
    // Create proper event
    const event = new Event('input', { bubbles: true });
    Object.defineProperty(event, 'target', { value: ta, enumerable: true });
    
    // Call onChange
    props.onChange(event);
    
    // Click Create button
    const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Create' && !b.disabled);
    if (createBtn) {
      createBtn.click();
      return 'Song creation triggered: ' + desc;
    } else {
      throw new Error('Create button not enabled');
    }
  }, description);
  
  console.log('Song creation triggered:', description);
  console.log('Waiting for generation...');
  
  // Wait for navigation to create page or song page
  await new Promise(r => setTimeout(r, 15000));
  
  const currentUrl = p.url();
  console.log('Current URL:', currentUrl);
  
  // Check library for the new song
  await p.goto('https://suno.com/me', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
  
  const songs = await p.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="song/"]'));
    return links.map(a => ({
      title: a.innerText.trim(),
      href: a.href
    })).filter(s => s.title.length > 0);
  });
  
  console.log('Songs in library:', songs.length);
  songs.slice(0, 5).forEach(s => console.log('  -', s.title, s.href));
}

async function main() {
  let args = process.argv.slice(2);

  // Parse --cloak flag
  if (args.includes('--cloak')) {
    useCloak = true;
    args = args.filter(a => a !== '--cloak');
  }

  const command = args[0];

  try {
    switch (command) {
      case 'navigate':
      case 'open':
        await navigate(args[1]);
        break;
      case 'screenshot':
        await takeScreenshot(args[1] || '/tmp/screenshot.png');
        break;
      case 'snapshot':
        await getSnapshot();
        break;
      case 'click':
        await clickElement(args[1]);
        break;
      case 'type':
      case 'fill':
        await typeText(args[1], args.slice(2).join(' '));
        break;
      case 'eval':
        await evaluateJs(args.slice(1).join(' '));
        break;
      case 'scroll':
        await scrollPage(args[1] || 'down');
        break;
      case 'wait':
        await waitMs(args[1] || '3000');
        break;
      case 'create-suno':
        await createSunoSong(args.slice(1).join(' ') || 'A romantic love song');
        break;
      case 'close':
        if (browser) {
          await browser.close();
          console.log('Browser disconnected');
        }
        break;
      default:
        console.log('Playwright + CloakBrowser Browser Controller for Diandian');
        console.log('');
        console.log('Usage:');
        console.log('  node browser-controller.js [--cloak] <command> [args...]');
        console.log('');
        console.log('Options:');
        console.log('  --cloak    Use CloakBrowser (stealth mode, anti-detection)');
        console.log('');
        console.log('Commands:');
        console.log('  navigate <url>              Navigate to URL');
        console.log('  screenshot [path]           Take screenshot (default: /tmp/screenshot.png)');
        console.log('  snapshot                    Get interactive element list');
        console.log('  click <selector>           Click element (@eN or CSS selector)');
        console.log('  type <selector> <text>   Type text into element');
        console.log('  eval <js-expression>     Evaluate JavaScript');
        console.log('  scroll <direction>        Scroll page (up/down/top/bottom)');
        console.log('  wait <ms>                  Wait milliseconds');
        console.log('  create-suno <desc>         Create a song on Suno');
        console.log('  close                       Close browser');
        console.log('');
        console.log('Examples:');
        console.log('  node browser-controller.js navigate https://example.com');
        console.log('  node browser-controller.js --cloak navigate https://protected-site.com');
        process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (browser && command !== 'close') {
      await browser.close();
    }
  }
}

main();
