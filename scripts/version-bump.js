#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error('用法: node scripts/version-bump.js 4.5.1');
  process.exit(1);
}

const packages = [
  '.',
  'packages/agent-soul-framework',
  'packages/agent-soul',
  'packages/agent-soul-skills',
];

for (const pkgDir of packages) {
  const path = join(pkgDir, 'package.json');
  const json = JSON.parse(readFileSync(path, 'utf-8'));
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
}

console.log(`版本已更新到 ${version}`);
