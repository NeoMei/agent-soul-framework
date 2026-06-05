#!/usr/bin/env node
import { startClawMessenger } from './index.js';

console.log('🦐 opencode-clawmessenger v0.1.0');
console.log('');

startClawMessenger().catch((err) => {
  console.error('❌ 启动失败:', err.message);
  process.exit(1);
});
