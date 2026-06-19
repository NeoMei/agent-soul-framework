// search-memory.mjs — 魂器记忆搜索工具
// 让 AI 在会话中主动查询 conversation 数据库
import { tool } from "@opencode-ai/plugin";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { existsSync } from "node:fs";

const PROJECT_DIR = process.cwd();
const DB_PATH = join(PROJECT_DIR, "memory", "short-term", "conversations.db");

function searchConversations(query, limit = 15) {
  if (!existsSync(DB_PATH)) return [];

  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    return db
      .prepare(
        "SELECT role, content, datetime(timestamp, 'unixepoch', 'localtime') as time FROM conversations WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?"
      )
      .all(%%, limit);
  } finally {
    db.close();
  }
}

function getRecent(limit = 10) {
  if (!existsSync(DB_PATH)) return [];

  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    return db
      .prepare(
        "SELECT role, content, datetime(timestamp, 'unixepoch', 'localtime') as time FROM conversations ORDER BY timestamp DESC LIMIT ?"
      )
      .all(limit);
  } finally {
    db.close();
  }
}

export default function SearchMemoryPlugin(ctx) {
  return {
    tool: {
      search_memory: tool({
        description:
          "搜索历史对话记忆数据库。用于查找之前讨论过的话题、问题、决策等。调用此工具可以找到与特定关键词相关的过往对话。",
        args: {
          query: tool.schema.string().describe("搜索关键词，用于在历史对话中查找相关内容"),
          limit: tool.schema.number().optional().describe("返回结果数量上限，默认15"),
        },
        async execute(args, context) {
          const query = args.query;
          const limit = args.limit || 15;

          if (!query) return "请提供搜索关键词";

          const results = searchConversations(query, limit);

          if (results.length === 0) {
            return 没有找到与 "" 相关的历史对话记录。;
          }

          let output = ## 记忆搜索结果: ""\n\n找到  条相关对话:\n\n;
          for (const r of results) {
            const emoji = r.role === "user" ? "👤" : "🤖";
            output += ${emoji} [] \n\n---\n\n;
          }
          return output;
        },
      }),

      recall_memory: tool({
        description:
          "回顾最近的对话记忆。不需要关键词，返回最新的对话记录摘要，帮助回忆最近的讨论内容。",
        args: {
          limit: tool.schema.number().optional().describe("返回的最近对话条数，默认10"),
        },
        async execute(args, context) {
          const limit = args.limit || 10;
          const results = getRecent(limit);

          if (results.length === 0) {
            return "记忆数据库中暂无对话记录。";
          }

          let output = ## 最近  条对话\n\n;
          for (const r of results) {
            const emoji = r.role === "user" ? "👤" : "🤖";
            output += ${emoji} [] \n\n---\n\n;
          }
          return output;
        },
      }),
    },
  };
}
