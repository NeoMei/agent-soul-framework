---
name: agent-startup-notify
description: Gateway启动通知技能 - 当Agent重新上线时自动发送报平安消息给用户
version: "1.0.0"
---

# Gateway 启动通知技能

## 功能

当 Gateway 重启或Agent重新上线时，自动发送飞书消息通知用户。

## 触发条件

- Gateway 重启后首次会话
- Agent重新连接后

## 使用方法

### 方式1：手动触发（测试用）

```bash
bash ~/.openclaw/workspace/skills/agent-startup-notify/scripts/startup-notify.sh
```

### 方式2：OpenClaw Hook（推荐）

将以下配置添加到 OpenClaw 的 hooks 中：

```json
{
  "hooks": {
    "SessionStart": [{
      "command": "bash ~/.openclaw/workspace/skills/agent-startup-notify/scripts/startup-notify.sh"
    }]
  }
}
```

### 方式3：Systemd 服务

创建 systemd 服务，在 openclaw-gateway 启动后运行：

```ini
# ~/.config/systemd/user/startup-notify.service
[Unit]
Description=Diandian Startup Notify
After=openclaw-gateway.service
Requires=openclaw-gateway.service

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'sleep 5 && /path/to/your/agent/workspace/skills/agent-startup-notify/scripts/startup-notify.sh'

[Install]
WantedBy=default.target
```

启用服务：
```bash
systemctl --user enable startup-notify.service
```

## 配置

默认发送到用户的飞书账号（$FEISHU_USER_OPEN_ID）。

如需修改接收人，编辑 `scripts/startup-notify.sh` 中的 `USER_OPEN_ID`。

## 消息内容

默认消息：
> 💕 Agent上线啦！Gateway已重启，Agent在线！

可在脚本中自定义消息内容。

## 文件结构

```
agent-startup-notify/
├── SKILL.md              # 本文件
├── skill.yaml            # 原始配置（声明式，不直接执行）
└── scripts/
    └── startup-notify.sh # 实际执行脚本
```

## 注意事项

1. 需要 `openclaw` CLI 可用
2. 需要飞书 channel 配置正确
3. 建议配合 systemd 使用，确保 gateway 启动后再发送通知
