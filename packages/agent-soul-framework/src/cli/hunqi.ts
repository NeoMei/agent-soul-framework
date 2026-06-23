/**
 * 魂器 CLI — @neomei/agent-soul-framework
 *
 * 用法: agent-soul-framework <command> [options]
 */

import { existsSync, readFileSync, mkdirSync, copyFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { join } from 'node:path';
import { homedir } from 'node:os';

const PACKAGE_ROOT = join(import.meta.dirname, '..', '..');

function loadJSON(filepath: string): unknown {
  try { return JSON.parse(readFileSync(filepath, 'utf-8')); } catch { return {}; }
}

function findSkillsPackage(): string | null {
  const candidates = [
    join(PACKAGE_ROOT, '..', 'agent-soul-skills'),
    join(PACKAGE_ROOT, 'node_modules', '@neomei', 'agent-soul-skills'),
    join(homedir(), '.config', 'agent-soul-framework', 'skills'),
  ];
  for (const root of candidates) {
    if (existsSync(join(root, 'skills', 'skill-creator', 'scripts', 'skill_creator.py'))) return root;
  }
  return null;
}

// ─── 命令实现 ──────────────────────────────────────────────

async function cmdStatus() {
  const pkg = loadJSON(join(PACKAGE_ROOT, 'package.json')) as { version?: string };
  console.log('\n  魂器 · Agent Soul Framework  v' + (pkg.version || '?'));
  console.log('  ' + '─'.repeat(40));

  const cwd = process.cwd();
  const hasSoul = existsSync(join(cwd, 'soul', 'SOUL.md'));
  const hasMemory = existsSync(join(cwd, 'memory', 'MEMORY.md'));
  const hasDb = existsSync(join(cwd, 'memory', 'short-term', 'conversations.db'));
  console.log('  项目状态: ' + (hasSoul ? '✅ 灵魂已加载' : '⚠️  不在魂器项目目录'));
  console.log('  记忆系统: ' + (hasMemory ? '✅' : '⚠️') + ' MEMORY.md | ' + (hasDb ? '✅' : '⚠️') + ' conversations.db');

  if (hasDb) {
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(join(cwd, 'memory', 'short-term', 'conversations.db'), { readOnly: true });
      const row = db.prepare('SELECT COUNT(*) as c FROM conversations').get() as { c: number } | undefined;
      const count = row?.c ?? 0;
      db.close();
      console.log('  会话记录: ' + count + ' 条');
    } catch {}
  }

  try {
    const { execSync } = await import('node:child_process');
    const ocVer = execSync((process.platform === 'win32' ? 'opencode.cmd' : 'opencode') + ' --version', { encoding: 'utf-8' }).trim();
    console.log('  OpenCode: ' + ocVer);
  } catch {
    console.log('  OpenCode: 未检测到');
  }
  console.log();
}

async function cmdHeartbeat() {
  try {
    await import('../heartbeat/runner.js');
  } catch (e: any) { console.error('心跳执行失败，请确保在魂器项目目录下运行:', e.message); }
}

interface SearchResult {
  source: string;
  date?: string;
  snippet: string;
}

async function cmdSearch(query: string) {
  if (!query) { console.log('用法: agent-soul-framework search <关键词>'); return; }
  try {
    const { searchAll } = await import('../memory/search.js');
    const results = searchAll(query) as SearchResult[];
    if (results.length === 0) { console.log('未找到结果'); return; }
    for (const r of results) {
      console.log('  [' + r.source + '] ' + (r.date || ''));
      console.log('  ' + r.snippet.slice(0, 150));
      console.log();
    }
  } catch(e: any) { console.error('搜索失败:', e.message); }
}

async function cmdMemory(args: string[]) {
  const sub = args[0];
  try {
    const sm = await import('../memory/structured.js');
    const MemClass = (sm as any).StructuredMemory;
    const mem = new MemClass();

    if (sub === 'status') {
      const stats = mem.getMemoryStats?.() || {};
      console.log(`MEMORY.md: ${stats.pct ?? 0}% (${stats.used ?? 0}/2200 chars), entries: ${stats.entries?.length ?? 0}`);
    } else if (sub === 'add') {
      if (!args[1]) { console.log('用法: agent-soul-framework memory add "内容"'); } else {
        mem.addMemory?.(args[1]);
        console.log('已添加');
      }
    } else if (sub === 'search') {
      if (!args[1]) { console.log('用法: agent-soul-framework memory search "关键词"'); } else {
        const hits = mem.search(args[1], 10) || [];
        for (const h of hits) {
          console.log('  [' + h.date + '] ' + (h.summary || '').slice(0, 200));
        }
      }
    } else {
      console.log('用法: agent-soul-framework memory <status|add|search>');
    }
    mem.close();
  } catch(e: any) { console.error('记忆操作失败:', e.message); }
}

async function cmdKnowledge(args: string[]) {
  const sub = args[0];
  try {
    if (sub === 'daily') {
      const { runDailyExtract } = await import('../knowledge/daily.js');
      await runDailyExtract();
    } else if (sub === 'index') {
      const { generateIndex } = await import('../knowledge/index.js');
      generateIndex();
    } else {
      console.log('用法: agent-soul-framework knowledge <daily|index>');
    }
  } catch(e: any) { console.error('知识操作失败:', e.message); }
}

async function cmdSkillCreate(args: string[]) {
  const skillsRoot = findSkillsPackage();
  if (!skillsRoot) {
    console.log('未安装技能包。如需使用 skill-create，请安装可选插件:');
    console.log('  npm install -g @neomei/agent-soul-skills');
    return;
  }
  const flag = args.includes('--dry-run') ? '--dry-run' : args.includes('--force') ? '--force' : '';
  try {
    const { execSync } = await import('node:child_process');
    const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
    execSync(pyCmd + ' ' + join(skillsRoot, 'skills', 'skill-creator', 'scripts', 'skill_creator.py') + ' ' + flag, {
      cwd: process.cwd(), stdio: 'inherit', timeout: 120000
    });
  } catch { console.error('技能创建失败（需要 Python + OpenCode serve 运行中）'); }
}

async function cmdInteractive() {
  try {
    const { execSync } = await import('node:child_process');
    const script = join(PACKAGE_ROOT, 'agent-soul-framework.sh');
    if (existsSync(script)) {
      if (process.platform === 'win32') {
        console.log('  ⚠️  TUI 模式在 Windows 上不支持，请使用 opencode serve 模式');
      } else {
        execSync('bash ' + script + ' interactive', { cwd: process.cwd(), stdio: 'inherit' });
      }
      return;
    }
  } catch {}
  console.log('请在魂器项目目录下运行: cd agent-soul-framework && ./agent-soul-framework.sh interactive');
}

async function cmdConfig() {
  const cfgPath = join(process.cwd(), '.opencode', 'opencode.json');
  const promptPath = join(process.cwd(), '.opencode', 'prompt.md');
  console.log('\n  配置路径: ' + cfgPath);
  console.log('  灵魂注入: ' + (existsSync(promptPath) ? '✅ prompt.md' : '⚠️  缺失'));
  console.log('  项目根: ' + process.cwd() + '\n');
}

async function cmdDoctor() {
  const cwd = process.cwd();
  let checkDir = cwd;
  if (!existsSync(join(checkDir, 'soul', 'SOUL.md'))) {
    const defaultDir = join(homedir(), '.agent-soul-framework');
    if (existsSync(join(defaultDir, 'soul', 'SOUL.md'))) {
      checkDir = defaultDir;
    }
  }
  console.log('\n  🔍 魂器诊断报告\n  ' + '─'.repeat(50));

  const nodeVer = process.version;
  console.log('  Node.js:      ' + nodeVer + '  ✅');

  try {
    const { execSync } = await import('node:child_process');
    const ocVer = execSync((process.platform === 'win32' ? 'opencode.cmd' : 'opencode') + ' --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    console.log('  OpenCode:     ' + ocVer + '  ✅');
  } catch { console.log('  OpenCode:     未安装 ❌ (npm install -g opencode-ai)'); }

  try {
    await fetch('http://localhost:19876/health', { signal: AbortSignal.timeout(2000) });
    console.log('  opencode serve: 运行中 :19876 ✅');
  } catch { console.log('  opencode serve: 未运行 ⚠️  (opencode serve --port 19876)'); }

  try {
    const { execSync } = await import('node:child_process');
    const fv = execSync((process.platform === 'win32' ? 'opencode-feishu.cmd' : 'opencode-feishu') + ' --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    console.log('  opencode-feishu: ' + fv + '  ✅');
  } catch { console.log('  opencode-feishu: 未安装 ⚠️'); }

  const feishuConfig = join(homedir(), '.config', 'opencode', 'feishu.json');
  if (existsSync(feishuConfig)) {
    try {
      const cfg = JSON.parse(readFileSync(feishuConfig, 'utf-8')) as { appId?: string };
      console.log('  飞书配置:      appId=' + (cfg.appId || '?').slice(0,8) + '... ✅');
    } catch { console.log('  飞书配置:      文件存在但格式错误 ❌'); }
  } else { console.log('  飞书配置:      未配置 ⚠️  (opencode-feishu setup)'); }

  const qiweiCfg = join(homedir(), '.config', 'opencode', 'qiwei.json');
  if (existsSync(qiweiCfg)) {
    console.log('  企微配置:      已配置 ✅');
  } else {
    console.log('  企微配置:      未配置（可选）');
  }

  const skillsRoot = findSkillsPackage();
  if (skillsRoot) {
    console.log('  技能插件包:   已安装 ✅');
  } else {
    console.log('  技能插件包:   未安装（可选）npm install -g @neomei/agent-soul-skills');
  }

  const hasSoul = existsSync(join(checkDir, 'soul', 'SOUL.md'));
  const hasMemory = existsSync(join(checkDir, 'memory', 'MEMORY.md'));
  const hasDb = existsSync(join(checkDir, 'memory', 'short-term', 'conversations.db'));
  console.log('  项目目录:      ' + checkDir);
  console.log('  项目灵魂:      ' + (hasSoul ? '✅' : '⚠️  未初始化，运行 agent-soul-framework start'));
  console.log('  记忆系统:      ' + (hasMemory ? '✅' : '⚠️ ') + 'MEMORY.md | ' + (hasDb ? '✅' : '⚠️ ') + 'conversations.db');

  if (hasDb) {
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(join(checkDir, 'memory', 'short-term', 'conversations.db'), { readOnly: true });
      const row = db.prepare('SELECT COUNT(*) as c FROM conversations').get() as { c: number } | undefined;
      const count = row?.c ?? 0;
      db.close();
      console.log('  记忆条目:      ' + count + ' 条');
    } catch { console.log('  记忆条目:      读取失败'); }
  }

  try {
    const { execSync } = await import('node:child_process');
    const isWin = process.platform === 'win32';
    const cron = isWin
      ? ''
      : execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf-8', timeout: 5000 });
    if (cron.includes('heartbeat_wrapper')) {
      console.log('  心跳调度:      crontab 已配置 ✅');
    } else {
      console.log('  心跳调度:      未配置 ⚠️  (运行 agent-soul-framework start 自动配置)');
    }
  } catch { console.log('  心跳调度:      检查失败'); }

  const envFile = join(checkDir, '.env');
  if (existsSync(envFile)) {
    const envContent = readFileSync(envFile, 'utf-8');
    const keys = envContent.split('\n').filter(l => l.includes('=') && !l.startsWith('#') && l.split('=')[1].trim());
    console.log('  环境变量:      .env 存在，已配置 ' + keys.length + ' 个变量 ✅');
  } else {
    console.log('  环境变量:      .env 不存在 ⚠️  (cp .env.example .env)');
  }

  console.log('\n  💡 一键修复: agent-soul-framework start\n');
}

async function cmdSetup() {
  let cwd = process.cwd();
  if (!existsSync(join(cwd, 'soul', 'SOUL.md'))) {
    const defaultDir = join(homedir(), '.agent-soul-framework');
    if (existsSync(join(defaultDir, 'soul', 'SOUL.md'))) {
      cwd = defaultDir;
    }
  }
  console.log('\n  🔧 魂器自动配置\n  ' + '─'.repeat(50));

  // Ensure directories exist (setup creates them if missing)
  const dirs = ['soul', 'memory', 'knowledge', '.opencode', 'heartbeat'];
  for (const d of dirs) {
    if (!existsSync(join(cwd, d))) mkdirSync(join(cwd, d), { recursive: true });
  }

  let copied = 0;
  const { readdirSync: rd, statSync } = await import('node:fs');
  function copyExamples(dir: string) {
    if (!existsSync(dir)) return;
    for (const f of rd(dir)) {
      const fp = join(dir, f);
      if (statSync(fp).isDirectory()) { copyExamples(fp); continue; }
      if (f.endsWith('.example')) {
        const target = fp.replace('.example', '');
        if (!existsSync(target)) { copyFileSync(fp, target); copied++; }
      }
    }
  }
  // Try CWD first, then PACKAGE_ROOT for template files
  function copyExamplesFrom(srcDir: string, dstDir: string) {
    if (!existsSync(srcDir)) return;
    if (!existsSync(dstDir)) mkdirSync(dstDir, { recursive: true });
    for (const f of rd(srcDir)) {
      const fp = join(srcDir, f);
      if (statSync(fp).isDirectory()) {
        copyExamplesFrom(fp, join(dstDir, f));
        continue;
      }
      if (f.endsWith('.example')) {
        const target = join(dstDir, f.replace('.example', ''));
        if (!existsSync(target)) { copyFileSync(fp, target); copied++; }
      }
    }
  }
  for (const sub of ['soul', '.opencode', 'memory', 'knowledge']) {
    const cwdDir = join(cwd, sub);
    const pkgDir = join(PACKAGE_ROOT, sub);
    // Check if CWD has .example files; if not, fall back to PACKAGE_ROOT
    const hasCwdExamples = existsSync(cwdDir) && rd(cwdDir).some(f => f.endsWith('.example'));
    if (hasCwdExamples) {
      copyExamples(cwdDir);
    } else if (existsSync(pkgDir)) {
      if (!existsSync(cwdDir)) mkdirSync(cwdDir, { recursive: true });
      copyExamplesFrom(pkgDir, cwdDir);
    }
  }

  // 复制 OpenCode 配置文件
  const srcOcDir = join(PACKAGE_ROOT, '.opencode');
  if (existsSync(srcOcDir)) {
    if (!existsSync(join(cwd, '.opencode'))) mkdirSync(join(cwd, '.opencode'), { recursive: true });
    for (const f of ['opencode.json', 'config.json']) {
      const src = join(srcOcDir, f + '.example');
      const dst = join(cwd, '.opencode', f);
      if (existsSync(src) && !existsSync(dst)) { copyFileSync(src, dst); copied++; }
    }
  }

  // 复制 OpenCode tools (记忆搜索等)
  const srcToolsDir = join(PACKAGE_ROOT, '.opencode', 'tools');
  const dstToolsDir = join(cwd, '.opencode', 'tools');
  if (existsSync(srcToolsDir)) {
    if (!existsSync(dstToolsDir)) mkdirSync(dstToolsDir, { recursive: true });
    for (const f of ['search-memory.mjs', 'read-plugin.js']) {
      const src = join(srcToolsDir, f);
      const dst = join(dstToolsDir, f);
      if (existsSync(src) && !existsSync(dst)) { copyFileSync(src, dst); copied++; }
    }
  }
  if (existsSync(join(PACKAGE_ROOT, 'AGENTS.md.example')) && !existsSync(join(cwd, 'AGENTS.md'))) {
    copyFileSync(join(PACKAGE_ROOT, 'AGENTS.md.example'), join(cwd, 'AGENTS.md')); copied++;
  }
  if (existsSync(join(PACKAGE_ROOT, 'TOOLS.md.example')) && !existsSync(join(cwd, 'TOOLS.md'))) {
    copyFileSync(join(PACKAGE_ROOT, 'TOOLS.md.example'), join(cwd, 'TOOLS.md')); copied++;
  }
  console.log('  📝 模板初始化: 复制了 ' + copied + ' 个配置模板');

  try {
    const { execSync } = await import('node:child_process');
    if (existsSync(join(cwd, 'node_modules', '.bin', 'agent-soul-heartbeat'))) {
      execSync(join(cwd, 'node_modules', '.bin', 'agent-soul-heartbeat'), { cwd, stdio: 'pipe', timeout: 120000, encoding: 'utf-8' });
    } else {
      execSync('agent-soul-heartbeat', { cwd, stdio: 'pipe', timeout: 120000, encoding: 'utf-8' });
    }
    console.log('  💓 记忆系统: 已初始化');
  } catch { console.log('  💓 记忆系统: 跳过'); }

  try {
    const { execSync } = await import('node:child_process');
    const cronLine = '*/30 * * * * cd ' + cwd + ' && ./heartbeat_wrapper.sh';
    const isWin2 = process.platform === 'win32';
    const existing = isWin2 ? '' : execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf-8' });
    if (isWin2) {
      console.log('  📅 心跳调度: Windows 请用 Task Scheduler 替代 crontab');
    } else if (!existing.includes('heartbeat_wrapper.sh')) {
    const newCron = existing.trim() + (existing.trim() ? '\n' : '') + cronLine + '\n';
    execSync('printf "%s" "$1" | crontab -', { encoding: 'utf-8', env: { ...process.env, '1': newCron } });
    console.log('  📅 心跳调度: crontab 已配置');
    } else {
      console.log('  📅 心跳调度: 已配置');
    }
  } catch { console.log('  📅 心跳调度: 跳过'); }

  const feishuConfig = join(homedir(), '.config', 'opencode', 'feishu.json');
  if (!existsSync(feishuConfig)) {
    console.log('\n  📱 飞书连接配置\n  ' + '─'.repeat(40));
    console.log('  未检测到飞书配置，现在开始设置...\n');
    try {
      const { execSync } = await import('node:child_process');
      execSync('opencode-feishu setup', { stdio: 'inherit', timeout: 300000 });
      console.log('\n  ✅ 飞书配置完成');

      // 注入灵魂 hooks 到 feishu.json
      try {
        const hooksDir = join(cwd, 'connectors', 'feishu', 'hooks');
        const srcHooksDir = join(PACKAGE_ROOT, 'connectors', 'feishu', 'hooks');
        if (existsSync(srcHooksDir)) {
          if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });
          for (const f of ['on-session-created.sh', 'on-session-idle.sh']) {
            const src = join(srcHooksDir, f);
            const dst = join(hooksDir, f);
            if (existsSync(src) && !existsSync(dst)) {
              copyFileSync(src, dst);
              try { if (process.platform !== 'win32') execSync('chmod +x ' + dst, { stdio: 'ignore', timeout: 3000 }); } catch {}
            }
          }
        }
        const feishuRaw = readFileSync(feishuConfig, 'utf-8');
        const feishuJson = JSON.parse(feishuRaw);
        feishuJson.hooks = {
          onSessionCreated: 'connectors/feishu/hooks/on-session-created.sh',
          onSessionIdle: 'connectors/feishu/hooks/on-session-idle.sh',
        };
        writeFileSync(feishuConfig, JSON.stringify(feishuJson, null, 2));
        console.log('  🪝 灵魂 hooks: 已注入 feishu.json ✅');
      } catch (hookErr: any) {
        console.log('  🪝 灵魂 hooks: 注入失败 (' + (hookErr.message || 'unknown') + ')');
      }
    } catch {
      console.log('\n  ⚠️  飞书配置跳过（手动配置: opencode-feishu setup）');
    }
  } else {
    console.log('  📱 飞书连接: 已配置');
    // 补充 hooks 配置（如果缺失）
    try {
      const { execSync: esc2 } = await import('node:child_process');
      const feishuRaw = readFileSync(feishuConfig, 'utf-8');
      const feishuJson = JSON.parse(feishuRaw);
      if (!feishuJson.hooks || !feishuJson.hooks.onSessionCreated) {
        const hooksDir = join(cwd, 'connectors', 'feishu', 'hooks');
        const srcHooksDir = join(PACKAGE_ROOT, 'connectors', 'feishu', 'hooks');
        if (existsSync(srcHooksDir)) {
          if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });
          for (const f of ['on-session-created.sh', 'on-session-idle.sh']) {
            const src = join(srcHooksDir, f);
            const dst = join(hooksDir, f);
            if (existsSync(src) && !existsSync(dst)) {
              copyFileSync(src, dst);
              try { if (process.platform !== 'win32') esc2('chmod +x ' + dst, { stdio: 'ignore', timeout: 3000 }); } catch {}
            }
          }
        }
        feishuJson.hooks = {
          onSessionCreated: 'connectors/feishu/hooks/on-session-created.sh',
          onSessionIdle: 'connectors/feishu/hooks/on-session-idle.sh',
        };
        writeFileSync(feishuConfig, JSON.stringify(feishuJson, null, 2));
        console.log('  🪝 灵魂 hooks: 已注入 feishu.json ✅');
      }
    } catch {}
    try {
      const { execSync } = await import('node:child_process');
      let feishuStatus: string;
      try { feishuStatus = execSync('opencode-feishu status', { encoding: 'utf-8', timeout: 5000 }).trim(); } catch { feishuStatus = 'stopped'; }
      if (feishuStatus.includes('stopped') || feishuStatus.includes('not running')) {
        console.log('  📱 飞书桥接: 正在启动...');
        execSync('opencode-feishu start --daemon', { stdio: 'ignore', timeout: 10000 });
        console.log('  📱 飞书桥接: 已启动 ✅');
      } else {
        console.log('  📱 飞书桥接: 运行中 ✅');
      }
    } catch { console.log('  📱 飞书桥接: 请手动运行 opencode-feishu start --daemon'); }
  }

  const qiweiConfig = join(homedir(), '.config', 'opencode', 'qiwei.json');
  if (!existsSync(qiweiConfig)) {
    console.log('\n  💬 企业微信配置\n  ' + '─'.repeat(40));
    console.log('  未检测到企微配置。');
    console.log('  如需使用企微: opencode-qiwei setup（需 botId + secret）');
    console.log('  跳过企微配置，继续...');
  } else {
    console.log('  💬 企微连接: 已配置');
    // 补充 hooks 配置（如果缺失）
    try {
      const { execSync: esc3 } = await import('node:child_process');
      const qiweiRaw = readFileSync(qiweiConfig, 'utf-8');
      const qiweiJson = JSON.parse(qiweiRaw);
      if (!qiweiJson.hooks || !qiweiJson.hooks.onSessionCreated) {
        const hooksDir = join(cwd, 'connectors', 'qiwei', 'hooks');
        const srcHooksDir = join(PACKAGE_ROOT, 'connectors', 'qiwei', 'hooks');
        if (existsSync(srcHooksDir)) {
          if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });
          for (const f of ['on-session-created.sh', 'on-session-idle.sh']) {
            const src = join(srcHooksDir, f);
            const dst = join(hooksDir, f);
            if (existsSync(src) && !existsSync(dst)) {
              copyFileSync(src, dst);
              try { if (process.platform !== 'win32') esc3('chmod +x ' + dst, { stdio: 'ignore', timeout: 3000 }); } catch {}
            }
          }
        }
        qiweiJson.hooks = {
          onSessionCreated: 'connectors/qiwei/hooks/on-session-created.sh',
          onSessionIdle: 'connectors/qiwei/hooks/on-session-idle.sh',
        };
        writeFileSync(qiweiConfig, JSON.stringify(qiweiJson, null, 2));
        console.log('  🪝 灵魂 hooks: 已注入 qiwei.json ✅');
      }
    } catch {}
    try {
      const { execSync } = await import('node:child_process');
      let qstatus: string;
      try { qstatus = execSync('opencode-qiwei status', { encoding: 'utf-8', timeout: 5000 }).trim(); } catch { qstatus = 'stopped'; }
      if (qstatus.includes('stopped') || qstatus.includes('not running')) {
        console.log('  💬 企微桥接: 正在启动...');
        execSync('opencode-qiwei start --daemon', { stdio: 'ignore', timeout: 10000 });
        console.log('  💬 企微桥接: 已启动 ✅');
      } else {
        console.log('  💬 企微桥接: 运行中 ✅');
      }
    } catch { console.log('  💬 企微桥接: 请手动运行 opencode-qiwei start --daemon'); }
  }

  try {
    await fetch('http://localhost:19876/health', { signal: AbortSignal.timeout(2000) });
    console.log('  🧠 OpenCode 引擎: 运行中 ✅');
  } catch {
    console.log('  🧠 OpenCode 引擎: 未运行');
    console.log('     请在新终端执行: opencode serve --port 19876');
  }

  console.log('\n  ✅ 配置完成！');
  console.log('  ──'.repeat(20));
  console.log('  已配置:');
  console.log('    📝 模板文件    — soul/ .opencode/ knowledge/');
  console.log('    💓 记忆系统    — conversations.db 已初始化');
  console.log('    📅 心跳调度    — crontab */30 分钟');
  console.log('    📱 飞书连接    — 配置文件就绪');
  if (existsSync(qiweiConfig)) console.log('    💬 企微连接    — 配置文件就绪');
  console.log('\n  如需检查状态: agent-soul-framework doctor');
}

async function askYN(prompt: string) {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => {
    rl.question(prompt, a => { rl.close(); resolve(a.trim().toLowerCase()); });
  });
  return answer === '' || answer === 'y' || answer === 'yes';
}

// ponytail: merged setupFeishuInteractive + setupQiweiInteractive
async function setupChannelInteractive(emoji: string, name: string, cli: string, timeout: number, hint: string) {
  console.log(`\n  ${emoji} ${name}配置 — ${hint}\n`);
  try {
    const { execSync } = await import('node:child_process');
    execSync(cli, { stdio: 'inherit', timeout });
    console.log(`  ✅ ${name}配置完成\n`);
  } catch { console.log(`  ⚠️  ${name}配置跳过（手动: ${cli}）\n`); }
}

async function setupFeishuInteractive() { return setupChannelInteractive('📱', '飞书', 'opencode-feishu setup', 300000, '终端将显示二维码，用飞书 App 扫码'); }
async function setupQiweiInteractive() { return setupChannelInteractive('💬', '企微', 'opencode-qiwei setup', 120000, '需要企业微信管理后台的 botId 和 secret'); }


async function startFeishu(feishuConfig: string) {
  if (!existsSync(feishuConfig)) return;
  try {
    const { execSync } = await import('node:child_process');
    let feishuStat: string;
    try { feishuStat = execSync('opencode-feishu status', { encoding: 'utf-8', timeout: 5000 }).trim(); } catch { feishuStat = 'stopped'; }
    if (feishuStat.includes('stopped') || feishuStat.includes('not running')) {
      console.log('  📱 飞书桥接: 启动中...');
      execSync('opencode-feishu start --daemon', { stdio: 'ignore', timeout: 10000 });
      console.log('  📱 飞书桥接: 已启动 ✅');
    } else {
      console.log('  📱 飞书桥接: 运行中 ✅');
    }
  } catch { console.log('  📱 飞书桥接: 启动失败'); }
}

async function startQiwei(qiweiConfig: string) {
  if (!existsSync(qiweiConfig)) return;
  try {
    const { execSync } = await import('node:child_process');
    let qiweiStat: string;
    try { qiweiStat = execSync('opencode-qiwei status', { encoding: 'utf-8', timeout: 5000 }).trim(); } catch { qiweiStat = 'stopped'; }
    if (qiweiStat.includes('stopped') || qiweiStat.includes('not running')) {
      execSync('opencode-qiwei start --daemon', { stdio: 'ignore', timeout: 10000 });
      console.log('  💬 企微桥接: 已启动 ✅');
    } else {
      console.log('  💬 企微桥接: 运行中 ✅');
    }
  } catch { /* optional */ }
}

async function cmdStart() {
  const cwd = process.cwd();
  const hasSoul = existsSync(join(cwd, 'soul', 'SOUL.md'));

  if (!hasSoul) {
    console.log('\n  📝 首次运行，自动初始化...');
    // ponytail: auto-init handled by cmdSetup now, just ensure dirs exist
    const autoDirs = ['soul', 'skills', 'knowledge', 'memory/short-term', 'memory/long-term', 'heartbeat', '.opencode'];
    for (const d of autoDirs) mkdirSync(join(cwd, d), { recursive: true });
    const autoDir = join(cwd, '__auto__');
    if (existsSync(autoDir)) {
      const { readdirSync: rd, renameSync, rmdirSync } = await import('node:fs');
      for (const f of rd(autoDir)) {
        const src = join(autoDir, f);
        const dst = join(cwd, f);
        if (!existsSync(dst)) renameSync(src, dst);
      }
      rmdirSync(autoDir);
    }
  }

  try {
    await fetch('http://localhost:19876/health', { signal: AbortSignal.timeout(2000) });
    console.log('  🧠 opencode serve: 运行中');
  } catch {
    console.log('  🧠 opencode serve: 启动中...');
    try {
      const { spawn } = await import('node:child_process');
      const cmd = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
      spawn(cmd, ['serve', '--port', '19876'], { stdio: 'ignore', detached: true, cwd }).unref();
      await new Promise(r => setTimeout(r, 3000));
      await fetch('http://localhost:19876/health', { signal: AbortSignal.timeout(2000) });
      console.log('  🧠 opencode serve: 已启动 ✅');
    } catch {
      console.log('  ⚠️  请手动启动: opencode serve --port 19876');
    }
  }

  const feishuConfig = join(homedir(), '.config', 'opencode', 'feishu.json');
  const qiweiConfig = join(homedir(), '.config', 'opencode', 'qiwei.json');
  const hasFeishu = existsSync(feishuConfig);
  const hasQiwei = existsSync(qiweiConfig);

  if (!hasFeishu && !hasQiwei) {
    console.log('\n  📡 选择通信通道:\n');
    console.log('  1. 飞书（推荐）— 扫码自动配置');
    console.log('  2. 企业微信  — 手动输入 botId + secret');
    console.log('  3. 跳过      — 仅启动本地引擎');
    console.log('  4. 两者都配');
    console.log('');

    const { createInterface } = await import('node:readline');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const choice = await new Promise<string>(resolve => {
      rl.question('  请选择 [1]: ', answer => { rl.close(); resolve(answer.trim() || '1'); });
    });

    switch (choice) {
      case '1': await setupFeishuInteractive(); break;
      case '2': await setupQiweiInteractive(); break;
      case '3': console.log('  ⏭️  跳过通信配置\n'); break;
      case '4': await setupFeishuInteractive(); await setupQiweiInteractive(); break;
      default: await setupFeishuInteractive();
    }
  } else if (!hasFeishu) {
    console.log('\n  📱 飞书未配置');
    const answer = await askYN('  是否现在配置？[Y/n]: ');
    if (answer) await setupFeishuInteractive();
  } else if (!hasQiwei) {
    console.log('\n  💬 企微未配置');
    const answer = await askYN('  是否现在配置？[Y/n]: ');
    if (answer) await setupQiweiInteractive();
  }

  // Re-check after setup may have created config files
  if (existsSync(feishuConfig)) await startFeishu(feishuConfig);
  if (existsSync(qiweiConfig)) await startQiwei(qiweiConfig);

  try {
    const { execSync } = await import('node:child_process');
    if (existsSync(join(cwd, 'node_modules', '.bin', 'agent-soul-heartbeat'))) {
      execSync(join(cwd, 'node_modules', '.bin', 'agent-soul-heartbeat'), { cwd, stdio: 'pipe', timeout: 60000, encoding: 'utf-8' });
    } else {
      execSync('agent-soul-heartbeat', { cwd, stdio: 'pipe', timeout: 60000, encoding: 'utf-8' });
    }
  } catch {}

  console.log('\n  ✅ 魂器已就绪！');
  if (hasFeishu) console.log('  飞书中 @机器人 即可对话');
  console.log('  agent-soul-framework doctor    # 查看完整状态\n');
}

// ─── 主入口 ────────────────────────────────────────────────

const pkgVersion = (loadJSON(join(PACKAGE_ROOT, 'package.json')) as { version?: string }).version || '3.0.0';
const HELP = '\n  魂器 · Agent Soul Framework  v' + pkgVersion + '\n\n' +
  '  用法: agent-soul-framework <command> [options]\n\n' +
  '  核心命令:\n' +
  '    start               一键启动（引擎+飞书+企微+心跳）\n' +
  '    setup               初始化/配置项目（模板+心跳+crontab）\n' +
  '    status              查看系统状态（记忆/知识/引擎）\n' +
  '    heartbeat           执行一次心跳（同步 + 索引 + 任务）\n' +
  '    search <关键词>      统一记忆搜索（会话 + 文件 + MEMORY.md）\n' +
  '    memory <子命令>       记忆管理\n' +
  '      status            查看 MEMORY.md 容量\n' +
  '      add <内容>         添加记忆条目\n' +
  '      search <关键词>    FTS5 全文搜索历史会话\n' +
  '    knowledge <子命令>    知识管理\n' +
  '      daily             每日知识提取\n' +
  '      index             生成/更新知识库索引\n' +
  '    skill-create [--force|--dry-run]  技能自动创建（需 agent-soul-skills）\n' +
  '    interactive         启动交互式 TUI（需在项目目录）\n' +
  '    config              查看配置路径\n' +
  '    doctor              系统诊断（检查所有组件状态）\n' +
  '  示例:\n' +
  '    agent-soul-framework status\n' +
  '    agent-soul-framework search "拍照"\n' +
  '    agent-soul-framework memory status\n' +
  '    agent-soul-framework knowledge daily\n' +
  '    agent-soul-framework heartbeat\n';

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case undefined: case 'help': case '--help': case '-h':
      console.log(HELP); break;
    case 'start':        await cmdStart(); break;
    case 'setup':         await cmdSetup(); break;
    case 'status':       await cmdStatus(); break;
    case 'heartbeat':    await cmdHeartbeat(); break;
    case 'search':       await cmdSearch(args[1]); break;
    case 'memory':       await cmdMemory(args.slice(1)); break;
    case 'knowledge':    await cmdKnowledge(args.slice(1)); break;
    case 'skill-create': await cmdSkillCreate(args.slice(1)); break;
    case 'interactive':  await cmdInteractive(); break;
    case 'config':       await cmdConfig(); break;
    case 'doctor':       await cmdDoctor(); break;
    default:
      console.log('未知命令: ' + cmd + '\n用法: agent-soul-framework help');
  }
}

main().catch(console.error);

