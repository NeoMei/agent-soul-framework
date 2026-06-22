// search-memory.mjs — 魂器四层记忆统一搜索工具
// 1. 短期对话 (conversations.db)
// 2. 结构化记忆 (memories.db FTS5 + MEMORY.md)
// 3. 知识库 (knowledge/)
// 4. 长期记忆 (memory/long-term/)
import { tool } from "@opencode-ai/plugin";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const PROJECT_DIR = process.cwd();
const DB_PATH = join(PROJECT_DIR, "memory", "short-term", "conversations.db");
const MEMORIES_DB = join(PROJECT_DIR, "memory", "short-term", "memories.db");
const MEMORY_MD = join(PROJECT_DIR, "memory", "MEMORY.md");
const LONG_TERM_DIR = join(PROJECT_DIR, "memory", "long-term");
const KNOWLEDGE_DIR = join(PROJECT_DIR, "knowledge");

// ─── Layer 5: ChromaDB 向量语义搜索 ─────────────────────
function searchVector(query, limit = 5) {
  try {
    // 查找 memory_manager.py 脚本路径
    const { execSync } = require("node:child_process");
    const scriptsDir = join(PROJECT_DIR, "..", "agent-soul-skills", "scripts");
    const pyScript = join(scriptsDir, "memory_manager.py");
    if (!existsSync(pyScript)) return [];
    
    // 尝试找到 python3
    let python = "python3";
    try { execSync("python3 --version 2>&1", { timeout: 3000 }); } catch {
      try { execSync("python --version 2>&1", { timeout: 3000 }); python = "python"; } catch {
        return [];
      }
    }

    const result = execSync(
      `${python} "${pyScript}" vector-search --json "${query}"`,
      { encoding: "utf-8", timeout: 30000, cwd: PROJECT_DIR }
    ).trim();

    if (!result || result.startsWith("[INFO]") || result.startsWith("用法")) return [];
    
    const parsed = JSON.parse(result);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, limit);
  } catch (err) {
    // ChromaDB 不可用或未安装，静默跳过
    return [];
  }
}
// ─── Layer 1: 短期对话搜索 ─────────────────────────────
function searchConversations(query, limit = 15) {
  if (!existsSync(DB_PATH)) return [];
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    return db
      .prepare(
        "SELECT role, content, datetime(timestamp, 'unixepoch', 'localtime') as time, session_id FROM conversations WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?"
      )
      .all(`%${query}%`, limit);
  } finally { db.close(); }
}

// ─── Layer 2: 结构化记忆 FTS5 搜索 ─────────────────────
function searchStructured(query, limit = 10) {
  if (!existsSync(MEMORIES_DB)) return [];
  const db = new DatabaseSync(MEMORIES_DB, { readOnly: true });
  try {
    // 先尝试 FTS5
    const hasFts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions_fts'").get();
    if (hasFts) {
      try {
        return db.prepare(
          "SELECT id as session_id, date, summary, participant FROM sessions_fts WHERE sessions_fts MATCH ? ORDER BY rank LIMIT ?"
        ).all(`"${query}"*`, limit);
      } catch {
        // FTS5 match failed, fall through to LIKE
      }
    }
    return db.prepare(
      "SELECT id as session_id, date, summary, participant FROM sessions WHERE summary LIKE ? OR content LIKE ? LIMIT ?"
    ).all(`%${query}%`, `%${query}%`, limit);
  } finally { db.close(); }
}

// ─── Layer 2b: MEMORY.md 搜索 ──────────────────────────
function searchMemoryMd(query) {
  if (!existsSync(MEMORY_MD)) return [];
  const content = readFileSync(MEMORY_MD, "utf-8");
  const results = [];
  const q = query.toLowerCase();
  for (const line of content.split("\n")) {
    if (line.toLowerCase().includes(q) && line.trim()) {
      results.push(line.trim().slice(0, 200));
    }
  }
  return results.slice(0, 5);
}

// ─── Layer 3: 知识库搜索 ───────────────────────────────
function searchKnowledge(query, limit = 10) {
  if (!existsSync(KNOWLEDGE_DIR)) return [];
  const results = [];
  const q = query.toLowerCase();

  function scanDir(dir, category = "") {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        if (statSync(full).isDirectory()) {
          scanDir(full, entry);
        } else if (entry.endsWith(".md") && !entry.startsWith(".")) {
          try {
            const content = readFileSync(full, "utf-8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(q)) {
                results.push({
                  file: category ? `${category}/${entry}` : entry,
                  title: lines[0].replace(/^#+\s*/, "").slice(0, 80) || entry,
                  snippet: lines.slice(Math.max(0, i - 1), i + 2).join(" ").slice(0, 200),
                });
                if (results.length >= limit) return;
              }
            }
          } catch {}
        }
      } catch {}
    }
  }

  scanDir(KNOWLEDGE_DIR);
  return results;
}

// ─── Layer 4: 长期记忆搜索 ─────────────────────────────
function searchLongTerm(query, limit = 10) {
  if (!existsSync(LONG_TERM_DIR)) return [];
  const results = [];
  const q = query.toLowerCase();
  const files = readdirSync(LONG_TERM_DIR)
    .filter(f => f.endsWith(".md"))
    .sort()
    .reverse() // newest first
    .slice(0, 30);

  for (const file of files) {
    try {
      const content = readFileSync(join(LONG_TERM_DIR, file), "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          results.push({
            date: file.replace(".md", ""),
            snippet: lines.slice(Math.max(0, i - 1), i + 2).join(" ").slice(0, 200),
          });
          if (results.length >= limit) return results;
        }
      }
    } catch {}
  }
  return results;
}

// ─── Plugin ────────────────────────────────────────────
export default function SearchMemoryPlugin(ctx) {
  return {
    tool: {
      // 统一记忆搜索 — 跨四层
      search_memory: tool({
        description:
          "【魂器四层记忆统一搜索】搜索所有记忆层：短期对话、结构化记忆、MEMORY.md、知识库、长期记忆。返回结果标注来源。用于查找历史讨论、已知事实、知识卡片等。",
        args: {
          query: tool.schema.string().describe("搜索关键词"),
          limit: tool.schema.number().optional().describe("每层返回结果上限，默认10"),
        },
        async execute(args, context) {
          const query = args.query;
          const limit = args.limit || 10;
          if (!query) return "请提供搜索关键词";

          let output = `## 🔍 记忆搜索: "${query}"\n\n`;

          // Layer 1
          const conv = searchConversations(query, limit);
          if (conv.length > 0) {
            output += `### 💬 短期对话 (${conv.length} 条)\n\n`;
            for (const r of conv) {
              const emoji = r.role === "user" ? "👤" : "🤖";
              output += `- ${emoji} [${r.time}] ${r.content.slice(0, 300)}\n`;
            }
            output += "\n";
          }

          // Layer 2
          const struct = searchStructured(query, limit);
          if (struct.length > 0) {
            output += `### 📋 结构化记忆 (${struct.length} 条)\n\n`;
            for (const r of struct) {
              output += `- 📅 ${r.date || "?"} | ${(r.summary || "").slice(0, 200)}\n`;
            }
            output += "\n";
          }

          // Layer 2b
          const memMd = searchMemoryMd(query);
          if (memMd.length > 0) {
            output += `### 📝 MEMORY.md (${memMd.length} 条)\n\n`;
            for (const r of memMd) {
              output += `- ${r}\n`;
            }
            output += "\n";
          }

          // Layer 5: ChromaDB 向量语义搜索
          const vec = searchVector(query, limit);
          if (vec.length > 0) {
            output += `### 🧬 向量语义 (${vec.length} 条)\n\n`;
            for (const r of vec) {
              const dist = (r.distance * 100).toFixed(1);
              output += `- [${r.collection}] ${(r.content || "").slice(0, 200)} (相关性 ${dist}%)\n`;
            }
            output += "\n";
          }

          // Layer 3
          const know = searchKnowledge(query, limit);
          if (know.length > 0) {
            output += `### 📚 知识库 (${know.length} 条)\n\n`;
            for (const r of know) {
              output += `- **${r.title}** \`${r.file}\` — ${r.snippet}\n`;
            }
            output += "\n";
          }

          // Layer 4
          const lt = searchLongTerm(query, limit);
          if (lt.length > 0) {
            output += `### 🗄️ 长期记忆 (${lt.length} 条)\n\n`;
            for (const r of lt) {
              output += `- 📅 ${r.date} — ${r.snippet}\n`;
            }
            output += "\n";
          }

          const total = conv.length + struct.length + memMd.length + know.length + lt.length + vec.length;
          if (total === 0) {
            return `未找到与 "${query}" 相关的记忆。`;
          }
          output += `---\n共 ${total} 条结果（短期 ${conv.length} + 结构 ${struct.length + memMd.length} + 知识 ${know.length} + 长期 ${lt.length} + 向量 ${vec.length}）`;
          return output;
        },
      }),

      // 回顾最近对话
      recall_memory: tool({
        description:
          "回顾最近的对话记忆。返回最新对话记录，帮助回忆近期讨论内容。",
        args: {
          limit: tool.schema.number().optional().describe("返回条数，默认15"),
        },
        async execute(args, context) {
          const limit = args.limit || 15;
          if (!existsSync(DB_PATH)) return "记忆数据库暂无记录。";

          const db = new DatabaseSync(DB_PATH, { readOnly: true });
          let results = [];
          try {
            results = db
              .prepare(
                "SELECT role, content, datetime(timestamp, 'unixepoch', 'localtime') as time, session_id FROM conversations ORDER BY timestamp DESC LIMIT ?"
              )
              .all(limit);
          } finally { db.close(); }

          if (results.length === 0) return "记忆数据库中暂无对话记录。";

          let output = `## 🕐 最近 ${results.length} 条对话\n\n`;
          for (const r of results) {
            const emoji = r.role === "user" ? "👤" : "🤖";
            output += `${emoji} [${r.time}] ${r.content.slice(0, 400)}\n\n---\n\n`;
          }
          return output;
        },
      }),

      // 知识库专项搜索
      search_knowledge: tool({
        description:
          "搜索魂器知识库（knowledge/ 目录）。查找 Agent 已学习的知识卡片，包括审计方法论、内控知识、会计标准等。",
        args: {
          query: tool.schema.string().describe("搜索关键词"),
          category: tool.schema.string().optional().describe("限定知识分类，如 methodology, system, philosophy 等"),
          limit: tool.schema.number().optional().describe("返回条数，默认10"),
        },
        async execute(args, context) {
          const query = args.query;
          const limit = args.limit || 10;
          if (!query) return "请提供搜索关键词";

          const results = searchKnowledge(query, limit);
          if (results.length === 0) return `知识库中未找到与 "${query}" 相关的卡片。`;

          let output = `## 📚 知识库搜索: "${query}"\n\n`;
          for (const r of results) {
            output += `- **${r.title}** \`${r.file}\`\n  ${r.snippet}\n\n`;
          }
          output += `---\n共 ${results.length} 条`;
          return output;
        },
      }),
    },
  };
}

