import { RongCloudClient, type RongCloudMessage } from './rongcloud/client.js';
import { OpencodeBridge } from './opencode/client.js';
import { loadConfig } from './core/config.js';
import { Logger } from './core/logger.js';
import { getOrRegisterToken, loadConfig as loadAutoConfig, getServerUrl, getAppKey } from './core/auto-register.js';
import { encryptQR } from './core/qr-crypto.js';
import { generateNodeId } from './core/auto-register.js';
import { RongyunMessageTypeEnum } from './core/types.js';

export async function startClawMessenger(): Promise<void> {
  const log = new Logger('ClawMessenger');
  
  log.info('🚀 启动 opencode-clawmessenger...');

  // 1. 加载配置
  let config = await loadConfig();
  
  // 2. 如果没有 token，自动注册
  if (!config.token) {
    log.info('未找到 token，开始自动注册...');
    const token = await getOrRegisterToken(config.serverUrl, undefined, log);
    if (!token) {
      log.error('自动注册失败，请运行: npx opencode-clawmessenger-setup');
      process.exit(1);
    }
    config.token = token;
    config.accountId = (await loadAutoConfig())?.nodeId || generateNodeId();
    log.info('自动注册成功');
  }

  log.info(`配置: nodeId=${config.accountId}, serverUrl=${config.serverUrl}`);
  log.info(`OpenCode: ${config.opencodeUrl}`);

  // 3. 初始化 OpenCode 桥接
  const opencodeBridge = new OpencodeBridge({
    baseUrl: config.opencodeUrl,
    directory: config.opencodeDir,
  }, log);

  // 4. 初始化融云客户端
  const rongClient = new RongCloudClient({
    appKey: config.appKey,
    token: config.token,
    accountId: config.accountId,
  }, log);

  // 5. 消息处理器
  const handleMessage = async (msg: RongCloudMessage) => {
    try {
      const content = typeof msg.content === 'string' 
        ? msg.content 
        : msg.content?.content || '';

      // 解析消息类型
      let msgData: any;
      try {
        msgData = JSON.parse(content);
      } catch {
        msgData = { msg_type: RongyunMessageTypeEnum.CHAT_MESSAGE, content };
      }

      const msgType = msgData.msg_type;

      switch (msgType) {
        case RongyunMessageTypeEnum.CHAT_MESSAGE:
        case RongyunMessageTypeEnum.SERVICE_CHAT_MESSAGE:
          await handleChatMessage(msgData, msg, opencodeBridge, config, log, rongClient);
          break;

        case RongyunMessageTypeEnum.CREATE_OPENCODE_SESSION:
          await handleCreateSession(msgData, opencodeBridge, config, log);
          break;

        case RongyunMessageTypeEnum.DELETE_OPENCODE_SESSION:
          await handleDeleteSession(msgData, opencodeBridge, log);
          break;

        case RongyunMessageTypeEnum.COMMAND:
          await handleCommand(msgData, rongClient, log);
          break;

        default:
          log.warn(`未处理的消息类型: ${msgType}`);
      }
    } catch (err: any) {
      log.error(`处理消息异常: ${err.message}`);
      await rongClient.sendMessage(
        msg.senderUserId, 
        `❌ 处理失败: ${err.message}`, 
        msg.conversationType
      );
    }
  };

  // 6. 连接融云
  const connected = await rongClient.connect(handleMessage);
  if (!connected) {
    throw new Error('融云连接失败');
  }

  log.info('✅ opencode-clawmessenger 已启动');
  log.info('等待消息...');

  // 7. 保持运行
  process.on('SIGINT', () => {
    log.info('正在关闭...');
    rongClient.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log.info('正在关闭...');
    rongClient.disconnect();
    process.exit(0);
  });
}

/**
 * 生成绑定二维码
 */
export async function generateBindQR(nodeName?: string): Promise<{ nodeId: string; qrData: string }> {
  const { generateNodeId, loadConfig: loadAutoConfig } = await import('./core/auto-register.js');
  
  let nodeId = (await loadAutoConfig())?.nodeId;
  if (!nodeId) {
    nodeId = generateNodeId();
  }
  
  const name = nodeName || (await loadAutoConfig())?.nodeName || require('os').hostname();
  
  const bindData = JSON.stringify({
    type: 'bind_openclaw',
    node_id: nodeId,
    name: name,
    timestamp: Date.now(),
  });

  const encrypted = encryptQR(bindData);
  
  return { nodeId, qrData: encrypted };
}

// ... 消息处理函数（保持不变）

async function handleChatMessage(
  data: any, 
  msg: RongCloudMessage, 
  bridge: OpencodeBridge, 
  config: any, 
  log: Logger,
  rongClient: RongCloudClient
): Promise<void> {
  const sessionId = data.session_id || `claw-${msg.senderUserId}`;
  const content = data.content || data._raw_content || '';

  log.info(`处理聊天消息: sessionId=${sessionId}`);

  const opencodeSessionId = await bridge.getOrCreateSession(sessionId, `虾说对话 ${msg.senderUserId}`);
  const reply = await bridge.sendMessage(opencodeSessionId, content, config.systemPrompt);

  await rongClient.sendMessage(
    msg.conversationType === 3 ? msg.targetId : msg.senderUserId,
    reply,
    msg.conversationType
  );
}

async function handleCreateSession(data: any, bridge: OpencodeBridge, config: any, log: Logger): Promise<void> {
  const sessionId = data.session_id || `claw-${Date.now()}`;
  log.info(`创建会话: ${sessionId}`);
  await bridge.getOrCreateSession(sessionId, data.title || '新会话');
}

async function handleDeleteSession(data: any, bridge: OpencodeBridge, log: Logger): Promise<void> {
  const sessionId = data.session_id;
  if (!sessionId) return;
  log.info(`删除会话: ${sessionId}`);
  await bridge.deleteSession(sessionId);
}

async function handleCommand(data: any, rongClient: RongCloudClient, log: Logger): Promise<void> {
  const command = data.command;
  log.info(`处理命令: ${command}`);
  await rongClient.sendMessage(data.source_im_id, `✅ 命令已接收: ${command}`, 1);
}

export { loadConfig, Logger, RongCloudClient, OpencodeBridge };
