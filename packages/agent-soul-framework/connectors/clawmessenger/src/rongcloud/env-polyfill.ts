/**
 * 浏览器环境 Polyfill
 * 使融云 SDK 能在 Node.js 下运行
 * 参考: claw-subagent-service/service/rongcloud/env-polyfill.js
 */
import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import WebSocket from 'ws';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
});

const win = dom.window;

// 复制 IndexedDB 相关对象
['indexedDB', 'IDBKeyRange', 'IDBRequest', 'IDBDatabase', 'IDBTransaction', 'IDBCursor', 'IDBIndex', 'IDBFactory'].forEach((k) => {
  try {
    if ((globalThis as any)[k]) {
      (win as any)[k] = (globalThis as any)[k];
    }
  } catch {}
});

// 设置全局对象
if ((globalThis as any).crypto && !(win as any).crypto) {
  (win as any).crypto = (globalThis as any).crypto;
}

try {
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, writable: true, configurable: true });
} catch { (globalThis as any).navigator = win.navigator; }

try {
  Object.defineProperty(globalThis, 'window', { value: win, writable: true, configurable: true });
} catch { (globalThis as any).window = win; }

try {
  Object.defineProperty(globalThis, 'document', { value: win.document, writable: true, configurable: true });
} catch { (globalThis as any).document = win.document; }

try {
  Object.defineProperty(globalThis, 'location', { value: win.location, writable: true, configurable: true });
} catch { (globalThis as any).location = win.location; }

(globalThis as any).WebSocket = WebSocket;

// Node.js 原生 XMLHttpRequest
import * as http from 'http';
import * as https from 'https';

class NodeXHR {
  readyState = 0;
  status = 0;
  responseText = '';
  onreadystatechange: (() => void) | null = null;
  private _method = '';
  private _url: URL | null = null;
  private _headers: Record<string, string> | null = null;

  open(method: string, url: string) {
    this._method = method;
    this._url = new URL(url);
  }

  send(body?: string) {
    if (!this._url) return;
    const mod = this._url.protocol === 'https:' ? https : http;
    const req = mod.request(
      this._url,
      { method: this._method, headers: this._headers || {} },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          this.status = res.statusCode || 0;
          if (typeof this.onreadystatechange === 'function') {
            this.readyState = 4;
            this.responseText = data;
            this.onreadystatechange();
          }
        });
      }
    );
    req.on('error', () => {});
    if (body) req.write(body);
    req.end();
  }

  setRequestHeader(k: string, v: string) {
    if (!this._headers) this._headers = {};
    this._headers[k] = v;
  }

  abort() {}
}

(globalThis as any).XMLHttpRequest = NodeXHR;
try { (win as any).XMLHttpRequest = NodeXHR; } catch {}

(globalThis as any).localStorage = (win as any).localStorage;
(globalThis as any).sessionStorage = (win as any).sessionStorage;

if (!(win as any).Blob) (win as any).Blob = (globalThis as any).Blob;
if (!(win as any).File) (win as any).File = (globalThis as any).File;

if (!(win as any).requestAnimationFrame) {
  (win as any).requestAnimationFrame = (cb: () => void) => setTimeout(cb, 16);
}
if (!(win as any).cancelAnimationFrame) {
  (win as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}
