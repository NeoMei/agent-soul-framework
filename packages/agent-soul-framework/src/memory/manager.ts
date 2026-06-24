/**
 * 魂器记忆管理器 — TypeScript 版
 * 使用 Node.js 24 内置 node:sqlite 模块
 */

// node:sqlite 仅 Node 22.5+ 可用，旧版本动态导入降级
let DatabaseSync: any = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // Node < 22.5: 数据库功能降级
}
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

const PROJECT_DIR = process.cwd();
const MEMORY_DIR = join(PROJECT_DIR, 'memory');
const DB_PATH = join(MEMORY_DIR, 'short-term', 'conversations.db');

function getOpenCodeDbPath(): string {
  const home = homedir();
  if (platform() === 'win32') {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'opencode', 'opencode.db');
  }
  if (platform() === 'darwin') {
    return join(home, 'Library', 'Application Support', 'opencode', 'opencode.db');
  }
  return join(home, '.local', 'share', 'opencode', 'opencode.db');
}
const OPENCODE_DB = getOpenCodeDbPath();

export class MemoryManager {
  db: any; // DatabaseSync (dynamic import, may be null if Node < 22.5)

  constructor() {
    mkdirSync(join(MEMORY_DIR, 'short-term'), { recursive: true });
    mkdirSync(join(MEMORY_DIR, 'long-term'), { recursive: true });
    if (!DatabaseSync) throw new Error('node:sqlite 不可用，需要 Node.js >= 22.5');
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT, role TEXT, content TEXT,
        timestamp REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_id);
      CREATE INDEX IF NOT EXISTS idx_conv_time ON conversations(timestamp);
    `);
  }

  save(sessionId: string, role: string, content: string) {
    const ts = Date.now() / 1000;
    this.db.prepare(
      'INSERT INTO conversations (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
    ).run(sessionId, role, content, ts);
    this.saveToFile(sessionId, role, content, ts);
  }

  private saveToFile(sessionId: string, role: string, content: string, ts: number) {
    const d = new Date(ts * 1000);
    const date = d.toISOString().split('T')[0];
    const time = d.toISOString().split('T')[1].split('.')[0];
    const file = join(MEMORY_DIR, 'long-term', `${date}.md`);
    appendFileSync(file, `\n## ${time} | ${role}\n\n${content.slice(0, 300)}\n\n---\n`);
  }

  syncFromOpenCode(): number {
    if (!existsSync(OPENCODE_DB)) { console.log('[sync] OpenCode DB 不存在'); return 0; }
    if (!DatabaseSync) return 0;
    const src = new DatabaseSync(OPENCODE_DB, { open: true, readOnly: true });
    let count = 0;

    try {
      const sessions = src.prepare(
        'SELECT id FROM session ORDER BY time_updated DESC LIMIT 50'
      ).all() as { id: string }[];

      for (const { id: sessId } of sessions) {
        const rows = src.prepare(`
          SELECT m.data AS msg, GROUP_CONCAT(p.data, '|||') AS parts
          FROM message m LEFT JOIN part p ON p.message_id = m.id
          WHERE m.session_id = ? GROUP BY m.id ORDER BY m.time_created
        `).all(sessId) as { msg: string; parts: string }[];

        for (const { msg: msgJson, parts: partsJson } of rows) {
          try {
            const msg = JSON.parse(msgJson || '{}');
            const role = msg.role;
            if (!['user', 'assistant'].includes(role)) continue;

            const text = (partsJson || '').split('|||')
              .map(p => { try { return JSON.parse(p); } catch { return null; } })
              .filter((p: any) => p?.type === 'text' && p.text)
              .map((p: any) => p.text).join(' ').trim();

            if (!text || text.length < 5) continue;

            const exists = this.db.prepare(
              'SELECT COUNT(*) as c FROM conversations WHERE session_id=? AND role=? AND content=?'
            ).get(sessId, role, text) as { c: number };

            if (exists.c === 0) { this.save(sessId, role, text); count++; }
          } catch {}
        }
      }
    } finally { src.close(); }

    console.log(`[sync] 从 OpenCode 同步了 ${count} 条对话`);
    return count;
  }

  search(query: string, limit = 15) {
    return this.db.prepare(
      'SELECT * FROM conversations WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?'
    ).all(`%${query}%`, limit);
  }

  recent(n = 10) {
    return this.db.prepare('SELECT * FROM conversations ORDER BY timestamp DESC LIMIT ?').all(n);
  }

  stats() {
    const count = (this.db.prepare('SELECT COUNT(*) as c FROM conversations').get() as any).c;
    const sessions = this.db.prepare(`
      SELECT session_id, COUNT(*) as cnt, MIN(timestamp) as first
      FROM conversations GROUP BY session_id ORDER BY first DESC LIMIT 10
    `).all();
    return { conversations: count, sessions };
  }

  close() { this.db.close(); }
}
