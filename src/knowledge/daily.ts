/**
 * 每日知识提取
 * 从对话中提取有价值知识点，归档到 knowledge/
 */

import { MemoryManager } from '../memory/manager.js';
import { OpenCodeAPI } from '../opencode/api.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const PROJECT_DIR = join(import.meta.dirname, '..', '..');
const KNOWLEDGE_DIR = join(PROJECT_DIR, 'knowledge');

const api = new OpenCodeAPI();

function getKnowledgeIndex(): string {
  const cats = ['body', 'emotion', 'evolution', 'growth', 'intimacy', 'methodology', 'philosophy', 'system'];
  return cats.map(cat => {
    const f = join(KNOWLEDGE_DIR, cat, 'INDEX.md');
    if (existsSync(f)) return `## ${cat}\n${readFileSync(f, 'utf-8').slice(0, 1500)}`;
    return `## ${cat}\n(空)`;
  }).join('\n\n');
}

export async function runDailyExtract() {
  const mm = new MemoryManager();
  const cutoff = Date.now() / 1000 - 86400; // 24 hours ago

  const rows = mm.db.prepare(
    'SELECT role, content FROM conversations WHERE timestamp > ? ORDER BY timestamp'
  ).all(cutoff) as { role: string; content: string }[];

  const dialog = rows
    .filter(r => ['user', 'assistant'].includes(r.role) && r.content.length > 5)
    .map(r => `${r.role}: ${r.content.slice(0, 500)}`)
    .join('\n');

  if (!dialog.trim()) { console.log('过去24小时无对话'); mm.close(); return; }

  const prompt = `你是Agent。从对话中提取值得长期保存的知识。无价值则回复"无"。
知识库索引：${getKnowledgeIndex().slice(0, 8000)}
对话: ${dialog.slice(0, 8000)}
格式: ### [分类] 文件名 | 标题\n- 核心内容\n- 详细说明`;

  const result = await api.callLLM(prompt);
  if (!result || result.includes('无')) { console.log('无新知识点'); mm.close(); return; }

  // Parse and save cards
  for (const block of result.split('### ').filter(Boolean)) {
    const lines = block.split('\n').filter(Boolean);
    const header = lines[0] || '';
    const m = header.match(/\[(\w+)\]\s+(.+?)\s*\|\s*(.+)/);
    if (!m) continue;

    const [, cat, file, title] = m;
    const content = lines.join('\n');
    const fpath = join(KNOWLEDGE_DIR, cat, file.endsWith('.md') ? file : file + '.md');
    mkdirSync(dirname(fpath), { recursive: true });
    appendFileSync(fpath, `\n## ${new Date().toISOString().split('T')[0]}\n\n${content}\n\n---\n`);
    console.log(`  → ${cat}/${file}`);
  }

  mm.close();
  console.log('知识提取完成');
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  runDailyExtract().catch(console.error);
}
