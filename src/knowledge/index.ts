/**
 * 知识库索引生成器
 * 替代 Python generate-knowledge-index.py
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';

const PROJECT_DIR = join(import.meta.dirname, '..', '..');
const KNOWLEDGE_DIR = join(PROJECT_DIR, 'knowledge');

const CATEGORIES = ['body', 'emotion', 'evolution', 'growth', 'intimacy', 'methodology', 'philosophy', 'system'];

export function generateIndex() {
  const lines = ['# 点点知识库总索引\n', '> 快速定位知识卡片\n'];

  for (const cat of CATEGORIES) {
    const dir = join(KNOWLEDGE_DIR, cat);
    if (!existsSync(dir)) continue;

    const files = readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'INDEX.md');
    if (files.length === 0) continue;

    lines.push(`\n## ${cat}`);
    for (const f of files.sort()) {
      const name = f.replace('.md', '');
      lines.push(`- [${name}](${cat}/${f})`);
    }

    // 生成分类 INDEX.md
    const idxContent = `# ${cat} - 知识索引\n\n> 点点${cat}类知识导航\n\n## 文件列表\n\n${files.map(f => `- [${f.replace('.md', '')}](${f})`).join('\n')}\n`;
    writeFileSync(join(dir, 'INDEX.md'), idxContent);
  }

  writeFileSync(join(KNOWLEDGE_DIR, 'INDEX.md'), lines.join('\n'));
  console.log('[index] 知识库索引已更新');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateIndex();
}
