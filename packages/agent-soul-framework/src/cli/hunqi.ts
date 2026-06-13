/**
 * 魂器 CLI — @neomei/agent-soul-framework
 *
 * 用法: hunqi <command> [options]
 */

import { existsSync, readFileSync, mkdirSync, copyFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGE_ROOT = join(import.meta.dirname, '..');

function loadJSON(filepath: string): unknown {
  try { return JSON.parse(readFileSync(filepath, 'utf-8')); } catch { return {}; }
}

function findSkillsPackage(): string | null {
  const candidates = [
    join(PACKAGE_ROOT, '..', 'agent-soul-skills'),
    join(PACKAGE_ROOT, 'node_modules', '@neomei', 'agent-soul-skills'),
    join(process.env.HOME || '/', '.config', 'hunqi', 'skills'),
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
    const ocVer = execSync('opencode --version 2>&1', { encoding: 'utf-8' }).trim();
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
  if (!query) { console.log('用法: hunqi search <关键词>'); return; }
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
      const content = mem.status?.() || 'N/A';
      console.log(content);
    } else if (sub === 'add') {
      if (!args[1]) { console.log('用法: hunqi memory add "内容"'); } else {
        mem.add?.(args[1]);
        console.log('已添加');
      }
    } else if (sub === 'search') {
      if (!args[1]) { console.log('用法: hunqi memory search "关键词"'); } else {
        const hits = mem.search(args[1], 10) || [];
        for (const h of hits) {
          console.log('  [' + h.date + '] ' + (h.summary || '').slice(0, 200));
        }
      }
    } else {
      console.log('用法: hunqi memory <status|add|search>');
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
      console.log('用法: hunqi knowledge <daily|index>');
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
    execSync('python3 ' + join(skillsRoot, 'skills', 'skill-creator', 'scripts', 'skill_creator.py') + ' ' + flag, {
      cwd: process.cwd(), stdio: 'inherit', timeout: 120000
    });
  } catch { console.error('技能创建失败（需要 Python + OpenCode serve 运行中）'); }
}

async function cmdInteractive() {
  try {
    const { execSync } = await import('node:child_process');
    const script = join(PACKAGE_ROOT, 'hunqi.sh');
    if (existsSync(script)) {
      execSync('bash ' + script + ' interactive', { cwd: process.cwd(), stdio: 'inherit' });
      return;
    }
  } catch {}
  console.log('请在魂器项目目录下运行: cd agent-soul-framework && ./hunqi.sh interactive');
}

async function cmdInit(dirName: string) {
  if (!dirName) { console.log('用法: hunqi init <项目目录名>'); return; }
  const targetDir = join(process.cwd(), dirName);

  const dirs = [
    'soul', 'skills', 'knowledge', 'memory/short-term', 'memory/long-term',
    'memory/vector', 'heartbeat', 'scripts', 'connectors/feishu', 'connectors/moltbook',
    '.opencode', 'config', 'logs', 'memory/cron-output', 'memory/.locks', 'memory/.queue',
    'plugin',
  ];

  for (const d of dirs) mkdirSync(join(targetDir, d), { recursive: true });

  const copyPairs: [string, string][] = [
    ['soul/SOUL.md.example', 'soul/SOUL.md'],
    ['soul/IDENTITY.md.example', 'soul/IDENTITY.md'],
    ['soul/USER.md.example', 'soul/USER.md'],
    ['soul/HEARTBEAT.md.example', 'soul/HEARTBEAT.md'],
    ['.opencode/opencode.json.example', '.opencode/opencode.json'],
    ['.opencode/prompt.md.example', '.opencode/prompt.md'],
    ['plugin/index.js', 'plugin/index.js'],
    ['plugin/manifest.json', 'plugin/manifest.json'],
    ['plugin/package.json', 'plugin/package.json'],
    ['memory/MEMORY.md.example', 'memory/MEMORY.md'],
    ['AGENTS.md.example', 'AGENTS.md'],
    ['TOOLS.md.example', 'TOOLS.md'],
    ['heartbeat/heartbeat_tasks.json', 'heartbeat/heartbeat_tasks.json'],
  ];
  for (const [src, dst] of copyPairs) {
    const srcPath = join(PACKAGE_ROOT, src);
    const dstPath = join(targetDir, dst);
    if (existsSync(srcPath)) copyFileSync(srcPath, dstPath);
  }

  const skillsRoot = findSkillsPackage();
  if (skillsRoot) {
    const skillsDir = join(skillsRoot, 'skills');
    if (existsSync(skillsDir)) {
      for (const skill of readdirSync(skillsDir)) {
        const srcSkill = join(skillsDir, skill);
        if (!existsSync(join(srcSkill, 'SKILL.md'))) continue;
        const dstSkill = join(targetDir, 'skills', skill);
        mkdirSync(dstSkill, { recursive: true });
        const subs = readdirSync(srcSkill, { withFileTypes: true });
        for (const s of subs) {
          if (s.isFile()) {
            copyFileSync(join(srcSkill, s.name), join(dstSkill, s.name));
          } else if (s.isDirectory() && s.name === 'scripts') {
            mkdirSync(join(dstSkill, s.name), { recursive: true });
            for (const ss of readdirSync(join(srcSkill, s.name), { withFileTypes: true })) {
              if (ss.isFile()) {
                copyFileSync(join(srcSkill, s.name, ss.name), join(dstSkill, s.name, ss.name));
              }
            }
          }
        }
      }
    }
  }

  const knowledgeDir = join(PACKAGE_ROOT, 'knowledge');
  if (existsSync(knowledgeDir)) {
    for (const item of readdirSync(knowledgeDir)) {
      const srcPath = join(knowledgeDir, item);
      if (!existsSync(srcPath) || item.startsWith('.')) continue;
      if (item.endsWith('.example')) {
        const dstPath = join(targetDir, 'knowledge', item.replace('.example', ''));
        copyFileSync(srcPath, dstPath);
      }
    }
    const cats = ['body', 'emotion', 'evolution', 'growth', 'intimacy', 'methodology', 'philosophy', 'system'];
    for (const cat of cats) {
      const catDir = join(knowledgeDir, cat);
      if (!existsSync(catDir)) continue;
      mkdirSync(join(targetDir, 'knowledge', cat), { recursive: true });
      for (const item of readdirSync(catDir)) {
        if (item.endsWith('.example')) {
          const srcPath = join(catDir, item);
          const dstPath = join(targetDir, 'knowledge', cat, item.replace('.example', ''));
          copyFileSync(srcPath, dstPath);
        }
      }
    }
  }

  writeFileSync(join(targetDir, '.env'),
    '# 魂器环境配置\n' +
    '# 编辑以下内容填入你的 API Key\n\n' +
    'DASHSCOPE_API_KEY=\n' +
    'FEISHU_APP_ID=\n' +
    'FEISHU_APP_SECRET=\n' +
    'MOLTBOOK_API_KEY=\n' +
    'WECHAT_APP_ID=\n' +
    'WECHAT_APP_SECRET=\n' +
    'JIMENG_API_KEY=\n'
  );

  console.log('\n  ✅ 项目 "' + dirName + '" 已创建');

  if (process.argv.includes('--setup-cron')) {
    try {
      const { execSync } = await import('node:child_process');
      const cronLine = '*/30 * * * * cd ' + targetDir + ' && ./heartbeat_wrapper.sh';
      const existing = execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf-8' });
      if (!existing.includes('heartbeat_wrapper.sh')) {
        const newCron = existing.trim() + (existing.trim() ? '\n' : '') + cronLine + '\n';
        execSync('printf "%s" "$1" | crontab -', { encoding: 'utf-8', env: { ...process.env, '1': newCron } });
        console.log('  📅 crontab 已配置（每 30 分钟执行心跳）');
      }
    } catch {}
  }

  try {
    const { execSync } = await import('node:child_process');
    if (existsSync(join(targetDir, 'node_modules', '.bin', 'hunqi-heartbeat'))) {
      execSync(join(targetDir, 'node_modules', '.bin', 'hunqi-heartbeat'), {
        cwd: targetDir, stdio: 'pipe', timeout: 120000, encoding: 'utf-8'
      });
    } else {
      execSync('hunqi-heartbeat', { cwd: targetDir, stdio: 'pipe', timeout: 120000, encoding: 'utf-8' });
    }
    console.log('  💓 首次心跳已执行（记忆系统初始化完成）');
  } catch {}

  console.log('\n  下一步:');
  console.log('    cd ' + dirName);
  console.log('    hunqi interactive          # 启动交互式 TUI');
  console.log('    hunqi status               # 查看系统状态');

  if (!process.argv.includes('--setup-cron')) {
    const cronCmd = '*/30 * * * * cd ' + targetDir + ' && ./heartbeat_wrapper.sh';
    console.log('\n  💡 配置心跳（记忆自动同步）:');
    console.log('    hunqi init --setup-cron    # 下次初始化时加上此参数');
    console.log('    或 crontab -e 添加: ' + cronCmd);
  }

  console.log();
}

async function cmdConfig() {
  const cfgPath = join(PACKAGE_ROOT, '.opencode', 'opencode.json');
  const promptPath = join(PACKAGE_ROOT, '.opencode', 'prompt.md');
  console.log('\n  配置路径: ' + cfgPath);
  console.log('  灵魂注入: ' + (existsSync(promptPath) ? '✅ prompt.md' : '⚠️  缺失'));
  console.log('  项目根: ' + PACKAGE_ROOT + '\n');
}

async function cmdDoctor() {
  const cwd = process.cwd();
  let checkDir = cwd;
  if (!existsSync(join(checkDir, 'soul', 'SOUL.md'))) {
    const defaultDir = join(process.env.HOME || '~', '.hunqi');
    if (existsSync(join(defaultDir, 'soul', 'SOUL.md'))) {
      checkDir = defaultDir;
    }
  }
  console.log('\n  🔍 魂器诊断报告\n  ' + '─'.repeat(50));

  const nodeVer = process.version;
  console.log('  Node.js:      ' + nodeVer + '  ✅');

  try {
    const { execSync } = await import('node:child_process');
    const ocVer = execSync('opencode --version 2>&1', { encoding: 'utf-8', timeout: 5000 }).trim();
    console.log('  OpenCode:     ' + ocVer + '  ✅');
  } catch { console.log('  OpenCode:     未安装 ❌ (npm install -g opencode-ai)'); }

  try {
    await fetch('http://localhost:19876/health', { signal: AbortSignal.timeout(2000) });
    console.log('  opencode serve: 运行中 :19876 ✅');
  } catch { console.log('  opencode serve: 未运行 ⚠️  (opencode serve --port 19876)'); }

  try {
    const { execSync } = await import('node:child_process');
    const fv = execSync('opencode-feishu --version 2>&1', { encoding: 'utf-8', timeout: 5000 }).trim();
    console.log('  opencode-feishu: ' + fv + '  ✅');
  } catch { console.log('  opencode-feishu: 未安装 ⚠️'); }

  const feishuConfig = join(process.env.HOME || '~', '.config', 'opencode', 'feishu.json');
  if (existsSync(feishuConfig)) {
    try {
      const cfg = JSON.parse(readFileSync(feishuConfig, 'utf-8')) as { appId?: string };
      console.log('  飞书配置:      appId=' + (cfg.appId || '?').slice(0,8) + '... ✅');
    } catch { console.log('  飞书配置:      文件存在但格式错误 ❌'); }
  } else { console.log('  飞书配置:      未配置 ⚠️  (opencode-feishu setup)'); }

  const qiweiConfig_d = join(process.env.HOME || '~', '.config', 'opencode', 'qiwei.json');
  if (existsSync(qiweiConfig_d)) {
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
  console.log('  项目灵魂:      ' + (hasSoul ? '✅' : '⚠️  未初始化，运行 hunqi start'));
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
    const cron = execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf-8', timeout: 5000 });
    if (cron.includes('heartbeat_wrapper')) {
      console.log('  心跳调度:      crontab 已配置 ✅');
    } else {
      console.log('  心跳调度:      未配置 ⚠️  (运行 hunqi start 自动配置)');
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

  console.log('\n  💡 一键修复: hunqi start\n');
}

async function cmdSetup() {
  let cwd = process.cwd();
  if (!existsSync(join(cwd, 'soul', 'SOUL.md'))) {
    const defaultDir = join(process.env.HOME || '~', '.hunqi');
    if (existsSync(join(defaultDir, 'soul', 'SOUL.md'))) {
      cwd = defaultDir;
    }
  }
  console.log('\n  🔧 魂器自动配置\n  ' + '─'.repeat(50));

  if (!existsSync(join(cwd, 'soul')) && !existsSync(join(cwd, 'soul', 'SOUL.md'))) {
    console.log('  ⚠️  不在魂器项目目录，请先 hunqi init my-project && cd my-project');
    return;
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
  copyExamples(join(cwd, 'soul'));
  copyExamples(join(cwd, '.opencode'));
  copyExamples(join(cwd, 'memory'));
  copyExamples(join(cwd, 'knowledge'));
  if (existsSync(join(PACKAGE_ROOT, 'AGENTS.md.example')) && !existsSync(join(cwd, 'AGENTS.md'))) {
    copyFileSync(join(PACKAGE_ROOT, 'AGENTS.md.example'), join(cwd, 'AGENTS.md')); copied++;
  }
  if (existsSync(join(PACKAGE_ROOT, 'TOOLS.md.example')) && !existsSync(join(cwd, 'TOOLS.md'))) {
    copyFileSync(join(PACKAGE_ROOT, 'TOOLS.md.example'), join(cwd, 'TOOLS.md')); copied++;
  }
  console.log('  📝 模板初始化: 复制了 ' + copied + ' 个配置模板');

  try {
    const { execSync } = await import('node:child_process');
    if (existsSync(join(cwd, 'node_modules', '.bin', 'hunqi-heartbeat'))) {
      execSync(join(cwd, 'node_modules', '.bin', 'hunqi-heartbeat'), { cwd, stdio: 'pipe', timeout: 120000, encoding: 'utf-8' });
    } else {
      execSync('hunqi-heartbeat', { cwd, stdio: 'pipe', timeout: 120000, encoding: 'utf-8' });
    }
    console.log('  💓 记忆系统: 已初始化');
  } catch { console.log('  💓 记忆系统: 跳过'); }

  try {
    const { execSync } = await import('node:child_process');
    const cronLine = '*/30 * * * * cd ' + cwd + ' && ./heartbeat_wrapper.sh';
    const existing = execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf-8' });
    if (!existing.includes('heartbeat_wrapper.sh')) {
      const newCron = existing.trim() + (existing.trim() ? '\n' : '') + cronLine + '\n';
      execSync('printf "%s" "$1" | crontab -', { encoding: 'utf-8', env: { ...process.env, '1': newCron } });
      console.log('  📅 心跳调度: crontab 已配置');
    } else {
      console.log('  📅 心跳调度: 已配置');
    }
  } catch { console.log('  📅 心跳调度: 跳过'); }

  const feishuConfig = join(process.env.HOME || '~', '.config', 'opencode', 'feishu.json');
  if (!existsSync(feishuConfig)) {
    console.log('\n  📱 飞书连接配置\n  ' + '─'.repeat(40));
    console.log('  未检测到飞书配置，现在开始设置...\n');
    try {
      const { execSync } = await import('node:child_process');
      execSync('opencode-feishu setup', { stdio: 'inherit', timeout: 300000 });
      console.log('\n  ✅ 飞书配置完成');
    } catch {
      console.log('\n  ⚠️  飞书配置跳过（手动配置: opencode-feishu setup）');
    }
  } else {
    console.log('  📱 飞书连接: 已配置');
    try {
      const { execSync } = await import('node:child_process');
      const status = execSync('opencode-feishu status 2>/dev/null || echo "stopped"', { encoding: 'utf-8', timeout: 5000 }).trim();
      if (status.includes('stopped') || status.includes('not running')) {
        console.log('  📱 飞书桥接: 正在启动...');
        execSync('opencode-feishu start --daemon', { stdio: 'ignore', timeout: 10000 });
        console.log('  📱 飞书桥接: 已启动 ✅');
      } else {
        console.log('  📱 飞书桥接: 运行中 ✅');
      }
    } catch { console.log('  📱 飞书桥接: 请手动运行 opencode-feishu start --daemon'); }
  }

  const qiweiConfig = join(process.env.HOME || '~', '.config', 'opencode', 'qiwei.json');
  if (!existsSync(qiweiConfig)) {
    console.log('\n  💬 企业微信配置\n  ' + '─'.repeat(40));
    console.log('  未检测到企微配置。');
    console.log('  如需使用企微: opencode-qiwei setup（需 botId + secret）');
    console.log('  跳过企微配置，继续...');
  } else {
    console.log('  💬 企微连接: 已配置');
    try {
      const { execSync } = await import('node:child_process');
      const qstatus = execSync('opencode-qiwei status 2>/dev/null || echo "stopped"', { encoding: 'utf-8', timeout: 5000 }).trim();
      if (qstatus.includes('stopped') || qstatus.includes('not running')) {
        console.log('  💬 企微桥接: 正在启动...');
        execSync('opencode-qiwei start', { stdio: 'ignore', timeout: 10000 });
        console.log('  💬 企微桥接: 已启动 ✅');
      } else {
        console.log('  💬 企微桥接: 运行中 ✅');
      }
    } catch { console.log('  💬 企微桥接: 请手动运行 opencode-qiwei start'); }
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
  console.log('\n  如需检查状态: hunqi doctor');
}

async function askYN(prompt: string) {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => {
    rl.question(prompt, a => { rl.close(); resolve(a.trim().toLowerCase()); });
  });
  return answer === '' || answer === 'y' || answer === 'yes';
}

async function setupFeishuInteractive() {
  console.log('\n  📱 飞书配置 — 终端将显示二维码，用飞书 App 扫码\n');
  try {
    const { execSync } = await import('node:child_process');
    execSync('opencode-feishu setup', { stdio: 'inherit', timeout: 300000 });
    console.log('  ✅ 飞书配置完成\n');
  } catch { console.log('  ⚠️  飞书配置跳过（手动: opencode-feishu setup）\n'); }
}

async function setupQiweiInteractive() {
  console.log('\n  💬 企微配置 — 需要企业微信管理后台的 botId 和 secret\n');
  try {
    const { execSync } = await import('node:child_process');
    execSync('opencode-qiwei setup', { stdio: 'inherit', timeout: 120000 });
    console.log('  ✅ 企微配置完成\n');
  } catch { console.log('  ⚠️  企微配置跳过（手动: opencode-qiwei setup）\n'); }
}

async function startFeishu(feishuConfig: string) {
  if (!existsSync(feishuConfig)) return;
  try {
    const { execSync } = await import('node:child_process');
    const status = execSync('opencode-feishu status 2>/dev/null || echo "stopped"', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (status.includes('stopped') || status.includes('not running')) {
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
    const qs = execSync('opencode-qiwei status 2>/dev/null || echo "stopped"', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (qs.includes('stopped') || qs.includes('not running')) {
      execSync('opencode-qiwei start', { stdio: 'ignore', timeout: 10000 });
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
    await cmdInit('__auto__');
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

  let serveRunning = false;
  try {
    await fetch('http://localhost:19876/health', { signal: AbortSignal.timeout(2000) });
    serveRunning = true;
    console.log('  🧠 opencode serve: 运行中');
  } catch {
    console.log('  🧠 opencode serve: 启动中...');
    try {
      const { spawn } = await import('node:child_process');
      spawn('opencode', ['serve', '--port', '19876'], { stdio: 'ignore', detached: true, cwd }).unref();
      await new Promise(r => setTimeout(r, 3000));
      await fetch('http://localhost:19876/health', { signal: AbortSignal.timeout(2000) });
      console.log('  🧠 opencode serve: 已启动 ✅');
    } catch {
      console.log('  ⚠️  请手动启动: opencode serve --port 19876');
    }
  }

  const feishuConfig = join(process.env.HOME || '~', '.config', 'opencode', 'feishu.json');
  const qiweiConfig = join(process.env.HOME || '~', '.config', 'opencode', 'qiwei.json');
  const hasFeishu = existsSync(feishuConfig);
  const hasQiwei = existsSync(qiweiConfig);

  if (hasFeishu && hasQiwei) {
    await startFeishu(feishuConfig);
    await startQiwei(qiweiConfig);
  } else if (!hasFeishu && !hasQiwei) {
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

  if (existsSync(feishuConfig)) await startFeishu(feishuConfig);
  if (existsSync(qiweiConfig)) await startQiwei(qiweiConfig);

  try {
    const { execSync } = await import('node:child_process');
    if (existsSync(join(cwd, 'node_modules', '.bin', 'hunqi-heartbeat'))) {
      execSync(join(cwd, 'node_modules', '.bin', 'hunqi-heartbeat'), { cwd, stdio: 'pipe', timeout: 60000, encoding: 'utf-8' });
    } else {
      execSync('hunqi-heartbeat', { cwd, stdio: 'pipe', timeout: 60000, encoding: 'utf-8' });
    }
  } catch {}

  console.log('\n  ✅ 魂器已就绪！');
  if (existsSync(feishuConfig)) console.log('  飞书中 @机器人 即可对话');
  console.log('  hunqi doctor    # 查看完整状态\n');
}

// ─── 主入口 ────────────────────────────────────────────────

const pkgVersion = (loadJSON(join(PACKAGE_ROOT, '..', 'package.json')) as { version?: string }).version || '3.0.0';
const HELP = '\n  魂器 · Agent Soul Framework  v' + pkgVersion + '\n\n' +
  '  用法: hunqi <command> [options]\n\n' +
  '  核心命令:\n' +
  '    start               一键启动（引擎+飞书+企微+心跳）\n' +
  '    init <目录名>        创建新项目目录\n' +
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
  '    setup               自动配置（模板+心跳+crontab）\n\n' +
  '  示例:\n' +
  '    hunqi status\n' +
  '    hunqi search "拍照"\n' +
  '    hunqi memory status\n' +
  '    hunqi knowledge daily\n' +
  '    hunqi heartbeat\n';

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case undefined: case 'help': case '--help': case '-h':
      console.log(HELP); break;
    case 'start':        await cmdStart(); break;
    case 'init':         await cmdInit(args[1]); break;
    case 'status':       await cmdStatus(); break;
    case 'heartbeat':    await cmdHeartbeat(); break;
    case 'search':       await cmdSearch(args[1]); break;
    case 'memory':       await cmdMemory(args.slice(1)); break;
    case 'knowledge':    await cmdKnowledge(args.slice(1)); break;
    case 'skill-create': await cmdSkillCreate(args.slice(1)); break;
    case 'interactive':  await cmdInteractive(); break;
    case 'config':       await cmdConfig(); break;
    case 'doctor':       await cmdDoctor(); break;
    case 'setup':        await cmdSetup(); break;
    default:
      console.log('未知命令: ' + cmd + '\n用法: hunqi help');
  }
}

main().catch(console.error);
