#!/usr/bin/env node
/**
 * 版本号批量更新工具
 * 用法: node scripts/version-bump.mjs 4.5.13
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error("用法: node scripts/version-bump.mjs 4.5.13");
  process.exit(1);
}

const packages: string[] = [
  ".",
  "packages/agent-soul-framework",
  "packages/agent-soul",
  "packages/agent-soul-skills",
];

for (const pkgDir of packages) {
  const pkgPath = join(pkgDir, "package.json");
  const json = JSON.parse(readFileSync(pkgPath, "utf-8"));
  json.version = version;
  writeFileSync(pkgPath, JSON.stringify(json, null, 2) + "\n");
}

console.log(`版本已更新到 ${version}`);
