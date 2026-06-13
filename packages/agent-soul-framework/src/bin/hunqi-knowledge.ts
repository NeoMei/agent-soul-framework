/**
 * hunqi-knowledge CLI entrypoint
 */
import { runDailyExtract } from '../knowledge/daily.js';

const cmd = process.argv[2] || 'daily';

if (cmd === 'daily') {
  await runDailyExtract();
} else {
  console.log('用法: hunqi-knowledge <daily>');
}
