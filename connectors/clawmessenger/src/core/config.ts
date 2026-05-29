import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ClawMessengerConfig } from './types.js';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode', 'clawmessenger');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function loadConfig(): ClawMessengerConfig {
  // 1. 从环境变量读取
  const envConfig: Partial<ClawMessengerConfig> = {
    appKey: process.env.CLAW_APP_KEY,
    token: process.env.CLAW_TOKEN,
    accountId: process.env.CLAW_ACCOUNT_ID,
    opencodeUrl: process.env.CLAW_OPENCODE_URL || 'http://127.0.0.1:19876',
    opencodeDir: process.env.CLAW_OPENCODE_DIR || process.cwd(),
    chatTimeout: process.env.CLAW_CHAT_TIMEOUT ? parseInt(process.env.CLAW_CHAT_TIMEOUT, 10) : 600,
  };

  // 2. 从配置文件读取
  let fileConfig: Partial<ClawMessengerConfig> = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (err) {
      console.warn(`[Config] 读取配置文件失败: ${err}`);
    }
  }

  // 3. 合并配置（环境变量优先级高于文件）
  const config: ClawMessengerConfig = {
    appKey: envConfig.appKey || fileConfig.appKey || '',
    token: envConfig.token || fileConfig.token || '',
    accountId: envConfig.accountId || fileConfig.accountId || '',
    opencodeUrl: envConfig.opencodeUrl || fileConfig.opencodeUrl || 'http://127.0.0.1:19876',
    opencodeDir: envConfig.opencodeDir || fileConfig.opencodeDir || process.cwd(),
    systemPrompt: envConfig.systemPrompt || fileConfig.systemPrompt || getDefaultSystemPrompt(),
    chatTimeout: envConfig.chatTimeout || fileConfig.chatTimeout || 600,
  };

  // 4. 验证必要配置
  if (!config.appKey || !config.token || !config.accountId) {
    throw new Error(
      '缺少必要配置: CLAW_APP_KEY, CLAW_TOKEN, CLAW_ACCOUNT_ID\n' +
      '请设置环境变量或编辑配置文件:\n' +
      CONFIG_FILE
    );
  }

  return config;
}

export function saveConfig(config: Partial<ClawMessengerConfig>): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  
  const existing = fs.existsSync(CONFIG_FILE) 
    ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) 
    : {};
  
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ ...existing, ...config }, null, 2),
    'utf-8'
  );
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
