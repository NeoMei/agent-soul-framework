import axios from 'axios';
import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import { readFile, access, writeFile, mkdir } from 'fs/promises';
import { getMacAddress } from './mac-address.js';
import type { Logger } from './logger.js';

const DEFAULT_SERVER_URL = 'https://newsradar.dreamdt.cn/im';
const TOKEN_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000; // 7天
const CONFIG_DIR = path.join(os.homedir(), '.claw-bridge');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * 生成节点ID
 */
export function generateNodeId(): string {
  const mac = getMacAddress();
  const random = crypto.randomBytes(3).toString('hex');
  return `claw_${mac.replace(/:/g, '').substring(0, 6)}_${random}`;
}

/**
 * 获取设备信息
 */
export function getDeviceInfo() {
  return {
    deviceName: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    cpuCount: os.cpus().length,
    macAddress: getMacAddress()
  };
}

/**
 * 注册节点 - 调用服务端接口
 */
export async function registerNode(
  serverUrl: string = DEFAULT_SERVER_URL,
  nodeName?: string,
  log?: Logger
): Promise<{ nodeId: string; nodeName: string; token: string; success: boolean }> {
  const nodeId = generateNodeId();
  const nickname = nodeName || os.hostname();
  const macAddress = getMacAddress();

  log?.info(`注册节点: ${nodeId}, 昵称: ${nickname}`);

  try {
    // 1. 尝试注册
    const response = await axios.post(
      `${serverUrl}/api/claw/register`,
      { node_id: nodeId, name: nickname, mac_address: macAddress },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    if (response.data?.code === 200) {
      const token = response.data.data?.token || response.data.data?.rong_token || response.data.rong_token || '';
      if (!token) {
        log?.error('注册接口未返回 token');
        return { nodeId, nodeName: nickname, token: '', success: false };
      }
      log?.info(`注册成功, Token: ${token.substring(0, 20)}...`);
      await saveConfig({ nodeId, nodeName: nickname, token, macAddress });
      return { nodeId, nodeName: nickname, token, success: true };
    }

    // 2. 节点已存在，获取 token
    if (response.data?.code === 409) {
      log?.info('节点已存在，获取 Token...');
      const tokenResp = await axios.get(`${serverUrl}/api/claw/token/${nodeId}`, { timeout: 10000 });

      if (tokenResp.data?.code === 200) {
        const token = tokenResp.data.data?.token || tokenResp.data.token || '';
        if (!token) {
          log?.error('获取 token 接口未返回 token');
          return { nodeId, nodeName: nickname, token: '', success: false };
        }
        await saveConfig({ nodeId, nodeName: nickname, token, macAddress });
        return { nodeId, nodeName: nickname, token, success: true };
      }
      log?.error(`获取 token 失败: ${tokenResp.data?.message || '未知错误'}`);
      return { nodeId, nodeName: nickname, token: '', success: false };
    }

    log?.error(`注册失败: code=${response.data?.code}, message=${response.data?.message}`);
    return { nodeId, nodeName: nickname, token: '', success: false };

  } catch (err: any) {
    log?.error(`注册异常: ${err.message}`);
    if (err.response) {
      log?.error(`服务端响应: status=${err.response.status}, data=${JSON.stringify(err.response.data)}`);
    }
    return { nodeId, nodeName: nickname, token: '', success: false };
  }
}

/**
 * 获取或注册 Token
 */
export async function getOrRegisterToken(
  serverUrl?: string,
  nodeName?: string,
  log?: Logger
): Promise<string> {
  // 1. 优先读取 config.json
  const existingConfig = await loadConfig();
  if (existingConfig?.token) {
    const isExpired = existingConfig.expiresAt ? Date.now() > existingConfig.expiresAt : false;
    if (!isExpired) {
      log?.info(`使用已有 token, nodeId=${existingConfig.nodeId}`);
      return existingConfig.token;
    }
    log?.info('token 已过期，重新获取...');
  }

  // 2. 服务端注册获取新 token
  const result = await registerNode(serverUrl, nodeName, log);
  if (result.success && result.token) {
    return result.token;
  }

  log?.error('获取 token 失败');
  return '';
}

/**
 * 保存配置
 */
export async function saveConfig(config: any): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
  } catch {}

  const data = {
    nodeId: config.nodeId,
    nodeName: config.nodeName,
    token: config.token,
    macAddress: config.macAddress,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + TOKEN_VALIDITY_MS
  };

  await writeFile(CONFIG_FILE, JSON.stringify(data, null, 2));
}

/**
 * 加载配置
 */
export async function loadConfig(): Promise<any> {
  try {
    await access(CONFIG_FILE);
    const content = await readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 获取 App Key（优先从环境变量读取，避免硬编码泄露）
 */
export function getAppKey(): string {
  return process.env.CLAW_APP_KEY || '';
}

/**
 * 获取服务端地址
 */
export function getServerUrl(): string {
  return process.env.DM_SERVER_URL || 'https://newsradar.dreamdt.cn/im';
}
