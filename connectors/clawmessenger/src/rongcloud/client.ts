import './env-polyfill.js';
import * as RongIMLibModule from '@rongcloud/imlib-next';
import type { Logger } from '../core/logger.js';

const RongIMLib: any = RongIMLibModule;

export interface RongCloudMessage {
  messageType: string;
  senderUserId: string;
  targetId: string;
  conversationType: number;
  content: string | { content?: string; [key: string]: any };
  isOffLineMessage: boolean;
  messageDirection: number;
  messageUId?: string;
}

export class RongCloudClient {
  private config: { appKey: string; token: string; accountId: string };
  private log: Logger;
  private isConnected = false;
  private messageHandler?: (msg: RongCloudMessage) => void;
  private sentMessageUIds = new Set<string>();

  constructor(config: { appKey: string; token: string; accountId: string }, log: Logger) {
    this.config = config;
    this.log = log;
  }

  async connect(handler: (msg: RongCloudMessage) => void): Promise<boolean> {
    this.messageHandler = handler;
    this.log.info('开始连接融云...');

    if (!RongIMLib || typeof RongIMLib.init !== 'function') {
      this.log.error('SDK 未正确加载');
      return false;
    }

    RongIMLib.init({ appkey: this.config.appKey });

    // 注册自定义消息类型
    try {
      if (typeof RongIMLib.registerMessageType === 'function') {
        RongIMLib.registerMessageType('command', false, false);
        RongIMLib.registerMessageType('service_chat', false, false);
        this.log.info('自定义消息类型已注册');
      }
    } catch (err: any) {
      this.log.warn(`注册自定义消息类型失败: ${err.message}`);
    }

    // 监听消息
    if (RongIMLib.addEventListener) {
      RongIMLib.addEventListener(RongIMLib.Events?.MESSAGES || 'MESSAGES', (event: any) => {
        event.messages?.forEach((msg: RongCloudMessage) => {
          this.handleReceivedMessage(msg);
        });
      });

      RongIMLib.addEventListener(RongIMLib.Events?.CONNECTED || 'CONNECTED', () => {
        this.log.info('融云连接成功');
        this.isConnected = true;
      });

      RongIMLib.addEventListener(RongIMLib.Events?.DISCONNECT || 'DISCONNECT', (code: any) => {
        this.log.warn(`融云断开连接, code: ${code}`);
        this.isConnected = false;
      });
    }

    try {
      const result = await RongIMLib.connect(this.config.token);
      if (result.code === 0 || result.code === 200) {
        this.log.info(`融云登录成功, userId: ${result.data?.userId}`);
        this.isConnected = true;
        return true;
      } else {
        this.log.error(`融云登录失败, code: ${result.code}`);
        return false;
      }
    } catch (err: any) {
      this.log.error(`融云连接异常: ${err.message}`);
      return false;
    }
  }

  private handleReceivedMessage(message: RongCloudMessage): void {
    try {
      // 过滤离线消息
      if (message.isOffLineMessage) return;

      // 过滤自己发送的消息
      if (message.messageDirection === 1) return;
      if (message.senderUserId === this.config.accountId) return;

      // 通过发送缓存过滤
      if (message.messageUId && this.sentMessageUIds.has(message.messageUId)) {
        return;
      }

      this.log.info(`收到消息: type=${message.messageType}, from=${message.senderUserId}`);
      
      // 异步处理消息，避免阻塞
      Promise.resolve().then(() => {
        this.messageHandler?.(message);
      }).catch((err: any) => {
        this.log.error(`消息处理异常: ${err.message}`);
      });
    } catch (err: any) {
      this.log.error(`handleReceivedMessage 异常: ${err.message}`);
    }
  }

  async sendMessage(targetId: string, content: string, conversationType: number = 1): Promise<void> {
    if (!this.isConnected) {
      this.log.warn('融云未连接，无法发送消息');
      return;
    }

    try {
      const result = await RongIMLib.sendMessage({
        conversationType,
        targetId,
        content: new RongIMLib.TextMessage({ content }),
      });

      if (result.code === 0 && result.data?.messageUId) {
        this.sentMessageUIds.add(result.data.messageUId || '');
        // 清理旧缓存
        if (this.sentMessageUIds.size > 100) {
          const first = this.sentMessageUIds.values().next().value;
          if (first) {
            this.sentMessageUIds.delete(first);
          }
        }
      }

      this.log.info(`消息发送成功: targetId=${targetId}`);
    } catch (err: any) {
      this.log.error(`消息发送失败: ${err.message}`);
    }
  }

  disconnect(): void {
    if (RongIMLib && typeof RongIMLib.disconnect === 'function') {
      RongIMLib.disconnect();
    }
    this.isConnected = false;
    this.log.info('融云连接已断开');
  }
}
