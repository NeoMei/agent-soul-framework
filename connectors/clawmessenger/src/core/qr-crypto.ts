/**
 * QR Code 加密工具
 * 与 clawmessenger 小程序/App 共享同一套算法
 * 算法：XOR 流密码 + Base64
 */

const QR_SECRET = 'dm_im_qr_key_v2_2026_secure';
const QR_SALT = 'qr_salt_x9k2';

function deriveKey(): number[] {
  const input = QR_SECRET + QR_SALT;
  const key = [];
  for (let i = 0; i < 32; i++) {
    let h = 0;
    for (let j = 0; j < input.length; j++) {
      h = ((h << 5) - h + input.charCodeAt((i + j) % input.length)) | 0;
    }
    key.push(h & 0xff);
  }
  return key;
}

function randomBytes(n: number): number[] {
  const bytes = [];
  for (let i = 0; i < n; i++) {
    bytes.push(Math.floor(Math.random() * 256));
  }
  return bytes;
}

function stringToUtf8Bytes(str: string): number[] {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

function toBase64(bytes: number[]): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += chars[a >> 2];
    result += chars[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[c & 63] : '=';
  }
  return result;
}

function checksum(bytes: number[]): number[] {
  let a = 0x67452301, b = 0xefcdab89;
  for (let i = 0; i < bytes.length; i++) {
    a = ((a << 5) - a + bytes[i] + b) | 0;
    b = ((b << 3) - b + bytes[i] + a) | 0;
  }
  return [(a >> 24) & 0xff, (a >> 16) & 0xff, (a >> 8) & 0xff, a & 0xff];
}

export function encryptQR(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(4);
  const plainBytes = stringToUtf8Bytes(plaintext);

  const cipherBytes = [];
  for (let i = 0; i < plainBytes.length; i++) {
    const keyIdx = (i + iv[i % 4]) % 32;
    cipherBytes.push(plainBytes[i] ^ key[keyIdx]);
  }

  const cs = checksum(plainBytes);
  const payload = [...iv, ...cipherBytes, ...cs];

  const base64 = toBase64(payload);
  const urlSafeBase64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return 'v2:' + urlSafeBase64;
}
