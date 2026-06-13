/**
 * 获取 MAC 地址
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { platform } from 'os';

export function getMacAddress(): string {
  const os = platform();
  try {
    if (os === 'win32') {
      const result = execSync('getmac /fo csv /nh', { encoding: 'utf-8' });
      const lines = result.trim().split('\n');
      if (lines.length > 0) {
        const parts = lines[0].split(',');
        if (parts.length > 0) {
          const mac = parts[0].replace(/"/g, '').trim().toUpperCase();
          if (/^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/.test(mac)) {
            return mac.replace(/-/g, ':');
          }
        }
      }
    } else if (os === 'linux') {
      const paths = ['/sys/class/net/eth0/address', '/sys/class/net/enp0s3/address', '/sys/class/net/eno1/address'];
      for (const path of paths) {
        try {
          const mac = readFileSync(path, 'utf-8').trim().toUpperCase();
          if (mac) return mac;
        } catch {}
      }
      const result = execSync('ip link show | grep ether | head -1', { encoding: 'utf-8' });
      const match = result.match(/([0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2})/);
      return match ? match[1].toUpperCase() : '00:00:00:00:00:00';
    } else if (os === 'darwin') {
      const result = execSync('ifconfig en0 | grep ether', { encoding: 'utf-8' });
      const match = result.match(/([0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2})/);
      return match ? match[1].toUpperCase() : '00:00:00:00:00:00';
    }
  } catch (error) {
    console.error('Failed to get MAC address:', error);
  }
  return '00:00:00:00:00:00';
}
