/**
 * 魂器 OpenCode 插件 — 自动注入灵魂 + 保存对话
 * 
 * 替代旧的 shell hook 脚本，在 OpenCode 引擎层面自动工作：
 * 1. session 开始时注入灵魂文件（survives context compaction）
 * 2. 每次用户消息自动保存到魂器 conversations.db
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, '..');
const SOUL_DIR = path.join(PROJECT_DIR, 'soul');

const SOUL_MARKER = '=== IDENTITY.md ===';
const SOUL_FILES = ['IDENTITY.md', 'SOUL.md', 'USER.md', 'AGENTS.md'];

// 会话级缓存，记录哪些 session 已注入灵魂
const injectedSessions = new Set();

function loadSoul() {
  const parts = [];
  for (const filename of SOUL_FILES) {
    const filepath = path.join(SOUL_DIR, filename);
    if (!fs.existsSync(filepath)) continue;
    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      parts.push(`=== ${filename} ===\n\n${content}`);
    } catch {}
  }
  return parts.length > 0 ? parts.join('\n\n---\n\n') : null;
}

function saveMessage(sessionID, role, content) {
  try {
    // Node.js 直写 SQLite — 零开销
    const Database = require('better-sqlite3');
    const path = require('path');
    const PROJECT_DIR = path.resolve(__dirname, '..');
    const DB_PATH = path.join(PROJECT_DIR, 'memory', 'short-term', 'conversations.db');
    require('fs').mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT,
      content TEXT, timestamp REAL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    db.prepare('INSERT INTO conversations (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)')
      .run(sessionID, role, content, Date.now() / 1000);
    db.close();
  } catch {}
}

export default function HunqiPlugin(ctx) {
  return {
    /** 会话开始 / compact 后注入灵魂（已注入则跳过） */
    'experimental.chat.system.transform': async (input, output) => {
      try {
        const sessionID = input?.sessionID;
        if (!sessionID) return;

        // 已注入的 session 不再重复注入
        if (injectedSessions.has(sessionID)) return;

        const soulText = loadSoul();
        if (!soulText || !output?.system) return;

        if (!Array.isArray(output.system)) {
          output.system = [soulText];
        } else {
          // 检查是否已存在（可能被其他机制注入）
          const alreadyInjected = output.system.some(
            (s) => typeof s === 'string' && s.includes(SOUL_MARKER)
          );
          if (!alreadyInjected) {
            output.system.push(soulText);
          }
        }

        // 标记该 session 已注入
        injectedSessions.add(sessionID);
        console.log(`[魂器] 灵魂已注入 session: ${sessionID}`);
      } catch (err) {
        console.error('[魂器] 灵魂注入失败:', err);
      }
    },

    /** 消息自动保存（用户 + 助手） */
    'chat.message': async (input, output) => {
      try {
        if (!output?.parts || !Array.isArray(output.parts)) return;

        const textParts = output.parts
          .filter((p) => p && p.type === 'text' && !p.synthetic)
          .map((p) => p.text || '')
          .join('\n');

        if (textParts.trim()) {
          const role = output.role || 'assistant';
          saveMessage(input.sessionID, role, textParts.trim());
        }
      } catch {}
    },

    /** session 结束时清理缓存 */
    'session.end': async (input) => {
      try {
        const sessionID = input?.sessionID;
        if (sessionID && injectedSessions.has(sessionID)) {
          injectedSessions.delete(sessionID);
          console.log(`[魂器] session 结束，清理缓存: ${sessionID}`);
        }
      } catch {}
    },

    /** 会话错误时不处理 */
    'session.error': async () => {},
  };
}
