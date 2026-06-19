import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const projectDir = process.argv[2] || process.cwd();
const dbPath = join(projectDir, 'memory', 'short-term', 'conversations.db');

if (!existsSync(dbPath)) {
  console.log('');
  process.exit(0);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
try {
  const rows = db.prepare(
    "SELECT role, content FROM conversations ORDER BY timestamp DESC LIMIT 20"
  ).all();

  let output = '';
  for (const row of rows) {
    const emoji = row.role === 'user' ? '👤' : '🤖';
    output += emoji + ' ' + row.content.slice(0, 200) + '\n\n';
  }
  console.log(output);
} finally {
  db.close();
}
