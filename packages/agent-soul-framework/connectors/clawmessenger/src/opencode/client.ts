import { createOpencodeClient } from '@opencode-ai/sdk/v2/client';
import type { Logger } from '../core/logger.js';

export class OpencodeBridge {
  private client: ReturnType<typeof createOpencodeClient>;
  private log: Logger;
  private sessions = new Map<string, string>(); // clawSessionId -> opencodeSessionId

  constructor(options: { baseUrl: string; directory?: string; password?: string }, log: Logger) {
    this.log = log;
    
    const config: any = {
      baseUrl: options.baseUrl,
      directory: options.directory || process.cwd(),
    };
    
    if (options.password) {
      config.headers = {
        'Authorization': `Basic ${Buffer.from(`opencode:${options.password}`).toString('base64')}`
      };
    }
    
    this.client = createOpencodeClient(config);
  }

  /**
   * 创建或获取会话
   */
  async getOrCreateSession(clawSessionId: string, title?: string): Promise<string> {
    // 检查已有会话
    if (this.sessions.has(clawSessionId)) {
      const existingId = this.sessions.get(clawSessionId)!;
      try {
        // 验证会话是否存在
        const { data } = await this.client.session.get({ sessionID: existingId });
        if (data) return existingId;
      } catch {
        // 会话不存在，创建新的
      }
    }

    // 创建新会话
    try {
      const { data, error } = await this.client.session.create({
        title: title || `ClawMessenger ${clawSessionId}`,
      });

      if (error) {
        throw new Error(`创建会话失败: ${error}`);
      }

      const sessionId = data?.id || (data as any)?.session_id;
      if (sessionId) {
        this.sessions.set(clawSessionId, sessionId);
        this.log.info(`创建会话成功: ${sessionId}`);
        return sessionId;
      }
      
      throw new Error('创建会话返回空 ID');
    } catch (err: any) {
      this.log.error(`创建会话异常: ${err.message}`);
      throw err;
    }
  }

  /**
   * 发送消息并获取回复
   */
  async sendMessage(
    sessionId: string, 
    text: string, 
    systemPrompt?: string,
    onDelta?: (delta: string) => void
  ): Promise<string> {
    try {
      // 构建消息
      let fullText = text;
      if (systemPrompt) {
        fullText = `${systemPrompt}\n\n${text}`;
      }

      const parts = [{ type: 'text' as const, text: fullText }];

      // 发送消息（使用 promptAsync 非阻塞）
      const { data, error } = await this.client.session.promptAsync({
        sessionID: sessionId,
        parts,
      });

      if (error) {
        throw new Error(`发送消息失败: ${error}`);
      }

      // 订阅事件流获取回复
      let fullResponse = '';
      
      if (onDelta) {
        // 如果有 onDelta 回调，通过事件流获取增量内容
        try {
          const events = await this.client.global.event({});
          // 处理事件流...
          // 这里简化处理，实际应该监听 SSE 事件
          fullResponse = await this.waitForResponse(sessionId);
        } catch {
          fullResponse = await this.waitForResponse(sessionId);
        }
      } else {
        fullResponse = await this.waitForResponse(sessionId);
      }

      return fullResponse;
    } catch (err: any) {
      this.log.error(`发送消息异常: ${err.message}`);
      throw err;
    }
  }

  /**
   * 等待会话完成并获取完整回复
   */
  private async waitForResponse(sessionId: string, timeoutMs: number = 300000): Promise<string> {
    const startTime = Date.now();
    let lastContent = '';

    while (Date.now() - startTime < timeoutMs) {
      try {
        const { data } = await this.client.session.get({ sessionID: sessionId });
        const status = (data as any)?.status;
        
        // 获取当前内容
        const messages = (data as any)?.messages || [];
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.content) {
          lastContent = lastMessage.content;
        }

        // 检查会话是否空闲
        if (status === 'idle') {
          return lastContent;
        }
      } catch {
        // 忽略查询错误
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return lastContent || '响应超时，请稍后重试';
  }

  /**
   * 删除会话
   */
  async deleteSession(clawSessionId: string): Promise<void> {
    const sessionId = this.sessions.get(clawSessionId);
    if (!sessionId) return;

    try {
      await this.client.session.delete({ sessionID: sessionId });
      this.sessions.delete(clawSessionId);
      this.log.info(`删除会话成功: ${sessionId}`);
    } catch (err: any) {
      this.log.error(`删除会话失败: ${err.message}`);
    }
  }
}
