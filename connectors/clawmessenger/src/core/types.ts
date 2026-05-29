/**
 * 融云消息类型枚举
 * 与 claw-subagent-service 保持一致
 */
export enum RongyunMessageTypeEnum {
  CLIENT_CONNECTED = 'client_connected',
  CLIENT_DISCONNECTED = 'client_disconnected',
  HEARTBEAT = 'heartbeat',
  HEARTBEAT_ACK = 'heartbeat_ack',
  COMMAND = 'command',
  COMMAND_RESULT = 'command_result',
  CHAT_MESSAGE = 'chat_message',
  CREATE_OPENCODE_SESSION = 'create_opencode_session',
  OPENCODE_SESSION_CREATED = 'opencode_session_created',
  DELETE_OPENCODE_SESSION = 'delete_opencode_session',
  SERVICE_CHAT_MESSAGE = 'service_chat_message',
  SERVICE_CHAT_RESPONSE = 'service_chat_response',
  CREATE_SERVICE_SESSION = 'create_service_session',
  SERVICE_SESSION_CREATED = 'service_session_created',
}

export interface ClawMessengerConfig {
  /** 融云 App Key */
  appKey: string;
  /** 融云 Token */
  token: string;
  /** 账号 ID */
  accountId: string;
  /** OpenCode 服务地址 */
  opencodeUrl: string;
  /** OpenCode 工作目录 */
  opencodeDir: string;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 聊天超时时间（秒） */
  chatTimeout?: number;
}

export interface RongyunMessage {
  msg_type: string;
  content?: string;
  request_id?: string;
  source_im_id?: string;
  room_id?: string;
  gateway_session_id?: string;
  session_id?: string;
  [key: string]: any;
}

export interface ChatSession {
  id: string;
  clawSessionId: string;
  createdAt: number;
  lastMessageAt: number;
}
