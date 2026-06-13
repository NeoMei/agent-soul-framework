/**
 * 简单日志工具
 */
export class Logger {
  private prefix: string;

  constructor(prefix: string = 'ClawMessenger') {
    this.prefix = prefix;
  }

  info(message: string): void {
    console.log(`[${this.prefix}] [INFO] ${new Date().toISOString()} ${message}`);
  }

  warn(message: string): void {
    console.warn(`[${this.prefix}] [WARN] ${new Date().toISOString()} ${message}`);
  }

  error(message: string): void {
    console.error(`[${this.prefix}] [ERROR] ${new Date().toISOString()} ${message}`);
  }

  debug(message: string): void {
    if (process.env.DEBUG) {
      console.log(`[${this.prefix}] [DEBUG] ${new Date().toISOString()} ${message}`);
    }
  }
}
