#!/usr/bin/env node
/**
 * opencode-clawmessenger 设置向导
 * 生成二维码让用户用 clawmessenger 扫码绑定
 */

import { generateBindQR, loadConfig } from '../dist/index.js';
import { registerNode, getServerUrl } from '../dist/core/auto-register.js';
import { encryptQR } from '../dist/core/qr-crypto.js';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt: string) => new Promise<string>(resolve => rl.question(prompt, resolve));

async function generateQRCodeInTerminal(data: string) {
  // 使用简单的 ASCII 二维码
  try {
    const QRCode = await import('qrcode');
    await QRCode.toString(data, { type: 'terminal', small: true });
  } catch {
    // 如果没有 qrcode 包，打印 URL
    console.log('\n请使用以下数据生成二维码:');
    console.log(data);
    console.log('\n或使用在线工具: https://cli.im');
  }
}

async function main() {
  console.log('🦐 opencode-clawmessenger 设置向导\n');

  // 1. 检查现有配置
  let config: any = null;
  try {
    config = await loadConfig();
  } catch {}

  if (config?.token) {
    console.log('✅ 已有配置:');
    console.log(`   节点 ID: ${config.accountId || 'unknown'}`);
    console.log(`   服务端: ${config.serverUrl || getServerUrl()}`);
    
    const reset = await question('\n是否重新注册？(y/N): ');
    if (reset.toLowerCase() !== 'y') {
      // 显示现有二维码
      console.log('\n========================================');
      console.log('  现有绑定二维码');
      console.log('========================================\n');
      const { nodeId, qrData } = await generateBindQR();
      await generateQRCodeInTerminal(qrData);
      console.log(`\n节点 ID: ${nodeId}`);
      console.log('提示：打开 App -> AI 助手 -> 扫码添加');
      rl.close();
      return;
    }
  }

  // 2. 输入昵称
  const defaultName = os.hostname();
  const name = await question(`节点昵称 [${defaultName}]: `);
  const nodeName = name.trim() || defaultName;

  // 3. 注册节点
  console.log(`\n正在注册节点: ${nodeName}...`);
  const serverUrl = getServerUrl();
  const result = await registerNode(serverUrl, nodeName);

  if (!result.success) {
    console.error('❌ 注册失败，请检查网络连接');
    rl.close();
    process.exit(1);
  }

  console.log(`✅ 注册成功!`);
  console.log(`   节点 ID: ${result.nodeId}`);

  // 4. 生成二维码
  console.log('\n========================================');
  console.log('  请使用 clawmessenger App 扫码绑定');
  console.log('========================================\n');

  const bindData = JSON.stringify({
    type: 'bind_openclaw',
    node_id: result.nodeId,
    name: nodeName,
    timestamp: Date.now(),
  });

  const encrypted = encryptQR(bindData);
  await generateQRCodeInTerminal(encrypted);

  console.log(`\n节点 ID: ${result.nodeId}`);
  console.log('提示：打开 App -> AI 助手 -> 扫码添加');
  console.log('\n绑定成功后，用户就可以通过 clawmessenger 与魂器聊天了！');

  rl.close();
}

main().catch(err => {
  console.error('错误:', err.message);
  process.exit(1);
});
