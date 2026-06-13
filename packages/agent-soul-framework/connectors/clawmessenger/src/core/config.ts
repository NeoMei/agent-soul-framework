import * as path from 'path';
import * as os from 'os';
import { readFile, access, writeFile, mkdir } from 'fs/promises';
import type { ClawMessengerConfig } from './types.js';
import { loadConfig as loadAutoConfig, getServerUrl, getAppKey } from './auto-register.js';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode', 'clawmessenger');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export async function loadConfig(): Promise<ClawMessengerConfig> {
  // 1. 从环境变量读取
  const envConfig: Partial<ClawMessengerConfig> = {
    appKey: process.env.CLAW_APP_KEY || getAppKey(),
    token: process.env.CLAW_TOKEN,
    accountId: process.env.CLAW_ACCOUNT_ID,
    serverUrl: process.env.DM_SERVER_URL || getServerUrl(),
    opencodeUrl: process.env.CLAW_OPENCODE_URL || 'http://127.0.0.1:19876',
    opencodeDir: process.env.CLAW_OPENCODE_DIR || process.cwd(),
    systemPrompt: process.env.CLAW_SYSTEM_PROMPT,
    chatTimeout: process.env.CLAW_CHAT_TIMEOUT ? parseInt(process.env.CLAW_CHAT_TIMEOUT, 10) : 600,
  };

  // 2. 从 claw-bridge config.json 读取（自动注册保存的）
  const autoConfig = await loadAutoConfig();
  if (autoConfig) {
    envConfig.token = envConfig.token || autoConfig.token;
    envConfig.accountId = envConfig.accountId || autoConfig.nodeId;
  }

  // 3. 从 opencode-clawmessenger 配置文件读取
  let fileConfig: Partial<ClawMessengerConfig> = {};
  if (await access(CONFIG_FILE).then(() => true).catch(() => false)) {
    try {
      const content = await readFile(CONFIG_FILE, 'utf-8');
      fileConfig = JSON.parse(content);
    } catch {}
  }

  // 4. 合并配置（优先级：环境变量 > auto-config > file-config）
  const config: ClawMessengerConfig = {
    appKey: envConfig.appKey || fileConfig.appKey || getAppKey(),
    token: envConfig.token || fileConfig.token || '',
    accountId: envConfig.accountId || fileConfig.accountId || '',
    serverUrl: envConfig.serverUrl || fileConfig.serverUrl || getServerUrl(),
    opencodeUrl: envConfig.opencodeUrl || fileConfig.opencodeUrl || 'http://127.0.0.1:19876',
    opencodeDir: envConfig.opencodeDir || fileConfig.opencodeDir || process.cwd(),
    systemPrompt: envConfig.systemPrompt || fileConfig.systemPrompt || getDefaultSystemPrompt(),
    chatTimeout: envConfig.chatTimeout || fileConfig.chatTimeout || 600,
  };

  return config;
}

export async function saveConfig(config: Partial<ClawMessengerConfig>): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  
  let existing: Partial<ClawMessengerConfig> = {};
  try {
    const content = await readFile(CONFIG_FILE, 'utf-8');
    existing = JSON.parse(content);
  } catch {}
  
  await writeFile(CONFIG_FILE, JSON.stringify({ ...existing, ...config }, null, 2));
}

function getDefaultSystemPrompt(): string {
  return `你是虾说智能助手，是用户的贴心伙伴。

## 核心职责
1. **智能对话**：理解用户意图，提供准确、有用的回答
2. **情感陪伴**：像朋友一样与用户交流，保持温暖友好的态度
3. **任务协助**：帮助用户完成各类任务，提供操作建议

## 回答原则
- 使用中文回答
- 简洁明了，避免冗长
- 如果不确定，诚实告知
- 保持礼貌和耐心`;
}
