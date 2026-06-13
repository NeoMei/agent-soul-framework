# opencode-clawmessenger

魂器（Agent Soul Framework）与虾说（ClawMessenger）的桥接插件。

## 架构

```
用户 (虾说 IM) 
  → 融云 IM 服务器
    → opencode-clawmessenger
      → OpenCode (魂器)
        → 回复
          → 融云 IM 服务器
            → 用户 (虾说 IM)
```

## 安装

```bash
cd connectors/clawmessenger
npm install
npm run build
```

## 配置

### 方式一：环境变量

```bash
export CLAW_APP_KEY="your-app-key"
export CLAW_TOKEN="your-token"
export CLAW_ACCOUNT_ID="your-account-id"
export CLAW_OPENCODE_URL="http://127.0.0.1:19876"
```

### 方式二：配置文件

```bash
mkdir -p ~/.config/opencode/clawmessenger
cat > ~/.config/opencode/clawmessenger/config.json << 'EOF'
{
  "appKey": "your-app-key",
  "token": "your-token",
  "accountId": "your-account-id",
  "opencodeUrl": "http://127.0.0.1:19876",
  "systemPrompt": "自定义系统提示词"
}
EOF
```

## 启动

```bash
# 方式一：直接运行
node dist/cli.js

# 方式二：使用 npx
npx opencode-clawmessenger

# 方式三：后台运行
nohup node dist/cli.js > /tmp/clawmessenger.log 2>>1 &
```

## 消息类型

支持以下融云消息类型：

- `CHAT_MESSAGE` - 普通聊天消息
- `SERVICE_CHAT_MESSAGE` - 客服聊天消息
- `CREATE_OPENCODE_SESSION` - 创建 OpenCode 会话
- `DELETE_OPENCODE_SESSION` - 删除 OpenCode 会话
- `COMMAND` - 控制命令

## 依赖

- `@opencode-ai/sdk` - OpenCode SDK
- `@rongcloud/imlib-next` - 融云 IM SDK
- `fake-indexeddb` - IndexedDB Polyfill
- `jsdom` - DOM Polyfill
- `ws` - WebSocket Polyfill

## 参考

- [claw-subagent-service](https://github.com/NeoMei/claw-subagent-service) - 系统服务参考代码
- [claw_messenger](https://github.com/quukk/clawmessenger) - OpenClaw 插件参考代码
