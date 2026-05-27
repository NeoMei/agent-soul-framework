/**
 * 统一记忆搜索
 * 替代 Python memory_search.py
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryManager } from './manager.js';
import { StructuredMemory } from './structured.js';

const PROJECT_DIR = join(import.meta.dirname, '..', '..');

export interface SearchResult {
  source: string;
  snippet: string;
  file?: string;
  date?: string;
}

export function searchAll(query: string): SearchResult[] {
  const results: SearchResult[] = [];

  // 1. FTS5 会话搜索
  try {
    const sm = new StructuredMemory();
    const hits = sm.search(query, 10) as any[];
    for (const h of hits) {
      results.push({
        source: '会话',
        snippet: (h.summary || '').slice(0, 200),
        date: h.date,
      });
    }
    sm.close();
  } catch {}

  // 2. conversations.db 搜索
  try {
    const mm = new MemoryManager();
    const hits = mm.search(query, 10) as any[];
    for (const h of hits) {
      results.push({
        source: '对话',
        snippet: (h as any).content?.slice(0, 200),
      });
    }
    mm.close();
  } catch {}

  // 3. 文件搜索
  const dirs = ['soul', 'knowledge', 'skills', 'memory', 'docs'];
  for (const dir of dirs) {
    const dirPath = join(PROJECT_DIR, dir);
    if (!existsSync(dirPath)) continue;
    try {
      const output = execSync(
        `grep -ri --include="*.md" -l "${query}" "${dirPath}" 2>/dev/null || true`,
        { encoding: 'utf-8', timeout: 5000 }
      );
      for (const file of output.split('\n').filter(Boolean).slice(0, 5)) {
        results.push({ source: '文件', snippet: file, file });
      }
    } catch {}
  }

  // 4. MEMORY.md 搜索
  const memFile = join(PROJECT_DIR, 'memory', 'MEMORY.md');
  if (existsSync(memFile)) {
    const content = readFileSync(memFile, 'utf-8');
    for (const line of content.split('\n')) {
      if (line.toLowerCase().includes(query.toLowerCase())) {
        results.push({ source: 'MEMORY.md', snippet: line.slice(0, 200) });
      }
    }
  }

  return results;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const query = process.argv[2] || '';
  if (!query) { console.log('用法: node search.js <关键词>'); process.exit(1); }
  const results = searchAll(query);
  console.log(`\n🔍 "${query}" — ${results.length} 条结果\n`);
  results.forEach((r, i) => {
    console.log(`[${i + 1}] [${r.source}] ${r.snippet.slice(0, 150)}`);
  });
}
