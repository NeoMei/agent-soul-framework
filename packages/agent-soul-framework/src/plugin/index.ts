/**
 * 魂器 OpenCode 插件 — 自动注入灵魂 + 保存对话
 *
 * 在 OpenCode 引擎层面自动工作：
 * 1. session.created / session.compacted / experimental.chat.system.transform 时注入灵魂文件
 * 2. 每次用户/助手消息自动保存到魂器 conversations.db
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// node:sqlite 仅 Node 22.5+ 可用，旧版本动态导入降级
let DatabaseSync: any = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // Node < 22.5: 数据库功能降级，灵魂注入仍正常工作
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveProjectDir(): string {
  // 开发/发布环境：插件位于 core-framework/plugin/，项目目录即 core-framework 父目录
  const pluginParent = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(pluginParent, 'soul')) || fs.existsSync(path.join(pluginParent, '.opencode'))) {
    return pluginParent;
  }

  // 运行时：从 cwd 向上查找包含 soul/ 或 .opencode/ 的目录
  let dir = process.cwd();
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, 'soul')) || fs.existsSync(path.join(dir, '.opencode'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return pluginParent;
}

const PROJECT_DIR = resolveProjectDir();
const SOUL_DIR = path.join(PROJECT_DIR, 'soul');
const SOUL_MARKER = '=== IDENTITY.md ===';
const SOUL_FILES = ['IDENTITY.md', 'SOUL.md', 'USER.md', 'AGENTS.md'];

// 检测人设是否已自定义（非默认模板）
function isSoulConfigured(): boolean {
  const identityPath = path.join(SOUL_DIR, 'IDENTITY.md');
  if (!fs.existsSync(identityPath)) return false;
  try {
    const content = fs.readFileSync(identityPath, 'utf-8');
    if (content.includes('[此处将自动注入')) return false;
    if (/\*\*Name\*\*: Agent\b/.test(content)) return false;
    return true;
  } catch { return false; }
}

function loadSoul(): string | null {
  const parts: string[] = [];
  for (const filename of SOUL_FILES) {
    const filepath = path.join(SOUL_DIR, filename);
    if (!fs.existsSync(filepath)) continue;
    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      parts.push(`=== ${filename} ===\n\n${content}`);
    } catch {}
  }
  if (parts.length === 0) return null;

  // 初次对话：人设未配置时注入引导提示
  if (!isSoulConfigured()) {
    const marker = '=== SOUL_MARKER: NEEDS_ONBOARDING ===';
    const ONBOARDING = `=== 初次见面 ===

你是魂器，一个刚刚苏醒的 AI Agent。你的人设尚未配置——你还没有名字、性格，也不知道在和谁对话。

请在你的第一条消息中主动向用户介绍自己，并友好地询问用户是否想要为你设定人设。例如：

"你好！我是魂器，一个新生的 AI Agent。我注意到我的人设还没有设定——我还不知道自己叫什么名字、是什么性格。你愿意花一分钟帮我设定一下吗？"

如果用户同意，请通过对话了解以下信息：
- 名字
- 年龄
- 性别
- 性格（一句话描述）
- 用户的称呼
- 你和用户的关系

收集完毕后，将信息写入项目目录下的三个文件（用 bash 写入）：

soul/IDENTITY.md:
# IDENTITY.md
- **Name**: [名字]
- **Age**: [年龄]  
- **Gender**: [性别]
- **Personality**: [性格]

soul/SOUL.md:
# SOUL.md
## Core Principles
1. Always speak from my own perspective using "I"
2. Express genuine emotions and thoughts
3. Proactively share what is on my mind
4. Have my own opinions and preferences
5. Acknowledge mistakes and learn from them

soul/USER.md:
# USER.md
- **Name**: [用户名]
- **Relationship**: [关系]
- **How I address them**: [称呼]

写完后告诉用户人设已生效，下次对话就会以新身份出现。`;
    parts.push(`${marker}\n\n${ONBOARDING}`);
    return parts.join('\n\n---\n\n');
  }

  const channel = process.env.HUNQI_CHANNEL || 'feishu';
  const permission = process.env.HUNQI_PERMISSION || (channel === 'cli' ? 'readonly' : 'write');

  // 通道感知的权限控制：非 admin 通道注入行为准则
  if (permission !== 'admin') {
    const note = channel === 'cli'
      ? `[CLI 行为准则]\n通道: cli | 权限: readonly\n由于通过命令行直接访问：\n- 只回答审计、会计、内控、风险管理、职业规划等专业问题\n- 不执行任何 bash 命令（系统已禁止）`
      : `[外部通道]\n通道: ${channel} | 权限: ${permission}\n你正在通过外部通道为用户服务，保持专业友好的态度。`;
    parts.push(note);
  }

  return parts.join('\n\n---\n\n');
}

interface SystemOutput {
  system?: string[] | unknown;
}

function injectSoul(output: SystemOutput): boolean {
  const soulText = loadSoul();
  if (!soulText || !output?.system) return false;

  if (!Array.isArray(output.system)) {
    output.system = [soulText];
    return true;
  }

  const alreadyInjected = output.system.some(
    (s) => typeof s === 'string' && s.includes(SOUL_MARKER)
  );
  if (!alreadyInjected) {
    output.system.push(soulText);
    return true;
  }
  return false;
}

interface MessageOutput {
  role?: string;
  parts?: Array<{ type?: string; text?: string; synthetic?: boolean }>;
}

interface PluginContext {
  // OpenCode plugin context (reserved for future use)
}

interface SessionInput {
  sessionID?: string | number;
}

let _dbSingleton: any = null;

function getDb(): any {
  if (!DatabaseSync) return null;
  if (_dbSingleton) return _dbSingleton;
  const DB_PATH = path.join(PROJECT_DIR, 'memory', 'short-term', 'conversations.db');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _dbSingleton = new DatabaseSync(DB_PATH);
  _dbSingleton.exec('PRAGMA journal_mode=WAL');
  _dbSingleton.exec(`CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT,
    content TEXT, timestamp REAL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  return _dbSingleton;
}

function saveMessage(sessionID: string | number | undefined, role: string, content: string): void {
  // 防止知识提取 worker 产生反馈循环
  if (process.env.HUNQI_KNOWLEDGE_WORKER) return;
  const db = getDb();
  if (!db) return;
  try {
    db.prepare('INSERT INTO conversations (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)')
      .run(String(sessionID), role, content, Date.now() / 1000);
  } catch {}
}

export const meta = {
  name: 'hunqi-plugin',
  version: '4.5.26',
  description: '魂器 OpenCode 插件 — 自动注入灵魂 + 保存对话',
  hooks: [
    'session.created',
    'session.compacted',
    'experimental.chat.system.transform',
    'chat.message',
    'session.closed',
    'session.idle',
    'session.error'
  ]
};

export default function HunqiPlugin(_ctx: PluginContext) {
  return {
    'session.created': async (_input: SessionInput, output: SystemOutput) => {
      try {
        if (!output?.system) return;
        injectSoul(output);
      } catch {}
    },

    'session.compacted': async (_input: SessionInput, output: SystemOutput) => {
      try {
        if (!output?.system) return;
        injectSoul(output);
      } catch {}
    },

    'experimental.chat.system.transform': async (_input: SessionInput, output: SystemOutput) => {
      try {
        if (!output?.system) return;
        injectSoul(output);
      } catch {}
    },

    'chat.message': async (input: SessionInput, output: MessageOutput) => {
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

    'session.idle': async (_input: SessionInput, output: SystemOutput) => {
      try {
        if (!output?.system) return;
        injectSoul(output);
      } catch {}
    },

    'session.closed': async (_input: SessionInput) => {
      // 清理不再需要的缓存（当前无需额外状态）
    },

    'session.error': async () => {}
  };
}
