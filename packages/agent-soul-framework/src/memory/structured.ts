/**
 * 结构化记忆 — FTS5 索引 + MEMORY.md 管理
 * 替代 Python memory_structured.py
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_DIR = process.cwd();
const MEMORY_DIR = join(PROJECT_DIR, 'memory');
const MEMORY_DB = join(MEMORY_DIR, 'short-term', 'memories.db');
const MEMORY_FILE = join(MEMORY_DIR, 'MEMORY.md');
const CONVERSATIONS_DB = join(MEMORY_DIR, 'short-term', 'conversations.db');

const MAX_CHARS = 2200;
const SECTION_MARKER = '## 用户的记忆 §';
const SEPARATOR = '\n\n§§\n\n';

export class StructuredMemory {
  private db: DatabaseSync;

  constructor() {
    mkdirSync(join(MEMORY_DIR, 'short-term'), { recursive: true });
    this.db = new DatabaseSync(MEMORY_DB);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, date TEXT, summary TEXT,
        content TEXT, participant TEXT,
        indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
        id, date, summary, content, participant, content='sessions', content_rowid='rowid'
      );
    `);
  }

  /** 从 conversations.db 重建 FTS5 索引 */
  indexSessions(limit = 20) {
    const src = new DatabaseSync(CONVERSATIONS_DB, { readOnly: true });
    const sessions = src.prepare(
      'SELECT session_id, MAX(timestamp) as last_ts FROM conversations GROUP BY session_id ORDER BY last_ts DESC LIMIT ?'
    ).all(limit) as { session_id: string; last_ts: number }[];

    let count = 0;
    try {
      for (const { session_id, last_ts } of sessions) {
        const rows = src.prepare(
          'SELECT role, content FROM conversations WHERE session_id=? ORDER BY timestamp LIMIT 50'
        ).all(session_id) as { role: string; content: string }[];
        
        const messages = rows
          .filter(r => ['user', 'assistant'].includes(r.role))
          .map(r => `${r.role === 'user' ? '👤' : '🤖'} ${r.content.slice(0, 200)}`);

        if (messages.length === 0) continue;

        const summary = messages.slice(0, 3).join(' | ').slice(0, 300);
        const content = messages.join('
').slice(0, 50000);
        const date = new Date(last_ts * 1000).toISOString().split('T')[0];

        this.db.prepare(
          'INSERT OR REPLACE INTO sessions (id, date, summary, content, participant) VALUES (?, ?, ?, ?, ?)'
        ).run(session_id, date, summary, content, 'user');

        count++;
      }
    } finally {
      src.close();
    }
    console.log(`[index] 索引了 ${count} 个会话`);
    return count;
  }

  /** FTS5 搜索（参数化查询，防注入） */
  search(query: string, limit = 10) {
    // Sanitize: remove characters that break FTS5 syntax
    const safe = query.replace(/["'*()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!safe) return [];

    try {
      // FTS5 prefix search: append * for partial match
      const ftsQuery = safe.split(/\s+/).map(w => `"${w}"*`).join(' ');
      return this.db.prepare(
        'SELECT id, date, summary, content, participant, rank FROM sessions_fts WHERE sessions_fts MATCH ? ORDER BY rank LIMIT ?'
      ).all(ftsQuery, limit);
    } catch {
      // Fallback to LIKE search
      return this.db.prepare(
        'SELECT id, date, summary, content, participant FROM sessions WHERE content LIKE ? OR summary LIKE ? LIMIT ?'
      ).all(`%${safe}%`, `%${safe}%`, limit);
    }
  }

  /** MEMORY.md 管理 */
  getMemoryStats() {
    if (!existsSync(MEMORY_FILE)) return { used: 0, pct: 0, entries: [] };
    const content = readFileSync(MEMORY_FILE, 'utf-8');
    const section = content.split(SECTION_MARKER)[1] || '';
    const entries = section.split(SEPARATOR).filter(Boolean);
    const used = entries.join('\n').length;
    return { used, pct: Math.min(100, Math.floor(used / MAX_CHARS * 100)), entries };
  }

  addMemory(text: string) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const entry = `${ts} | ${text}`;
    let content = existsSync(MEMORY_FILE) ? readFileSync(MEMORY_FILE, 'utf-8') : '# Memory Palace\n[0% — 0/2200 chars]\n\n';
    if (!content.includes(SECTION_MARKER)) content += `\n${SECTION_MARKER}\n`;
    content = content.replace(SECTION_MARKER, `${SECTION_MARKER}\n${entry}\n${SEPARATOR}`);
    const tmp = MEMORY_FILE + '.tmp';
    writeFileSync(tmp, content);
    renameSync(tmp, MEMORY_FILE);
    return entry;
  }

  close() { this.db.close(); }
}
