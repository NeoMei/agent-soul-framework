/**
 * 魂器心跳 Runner — TypeScript 版
 * 替代 Python heartbeat/runner_v2.py
 * 
 * 每30分钟由 crontab 触发，执行：
 * 1. 记忆同步 + FTS5 索引
 * 2. 锚点任务 (固定时间)
 * 3. 动态任务 (条件触发)
 */

import { MemoryManager } from '../memory/manager.js';
import { StructuredMemory } from '../memory/structured.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_DIR = process.cwd();
const TASKS_FILE = join(PROJECT_DIR, 'heartbeat', 'heartbeat_tasks.json');

function now() { return new Date(); }
function hhmm(d = now()) { return d.getHours() * 60 + d.getMinutes(); }
function today() { return now().toISOString().split('T')[0]; }

function loadTasks() {
  if (!existsSync(TASKS_FILE)) return { anchors: [], dynamic: [], history: [] };
  return JSON.parse(readFileSync(TASKS_FILE, 'utf-8'));
}

async function main() {
  console.log(`\n=== 魂器心跳 v3 | ${now().toISOString().slice(0, 16)} ===`);

  // 同步 + 索引
  try {
    const mm = new MemoryManager();
    mm.syncFromOpenCode();
    mm.close();

    const sm = new StructuredMemory();
    sm.indexSessions(20);
    sm.close();
  } catch (e) { console.error('[sync] 失败:', e); }

  // 任务调度
  const tasks = loadTasks();
  const curMin = hhmm();

  for (const anchor of tasks.anchors || []) {
    if (!anchor.enabled && anchor.enabled !== undefined) continue;
    const [h, m] = anchor.time.split(':').map(Number);
    if (Math.abs(curMin - (h * 60 + m)) > 15) continue;
    
    // 今天已执行？
    const done = (tasks.history || []).some((h: any) => h.task_id === anchor.id && h.date === today());
    if (done) continue;

    console.log(`[EXEC] ${anchor.id}: ${anchor.principle?.slice(0, 60)}`);
    tasks.history = tasks.history || [];
    tasks.history.push({ task_id: anchor.id, date: today(), time: now().toISOString(), result: 'ok' });
    // Persist task history to disk so deduplication works across runs
    try { writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2)); } catch (e) { console.error('[heartbeat] 保存任务历史失败:', (e as Error).message); }
  }

  console.log('[DONE] 心跳完成\n');
}

main().catch(console.error);
