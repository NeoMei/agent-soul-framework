# 魂器安全策略文档

## 概述

本文档定义了魂器（Agent Soul Framework）的安全控制机制，确保 AI Agent 在作为客服机器人使用时不会被恶意利用。

## 安全架构：多层防护

### 第一层：飞书白名单（入口控制）

**配置文件**: `~/.config/opencode/feishu.json`

- `allowlist`: 仅允许特定 union_id 的用户访问机器人
- `requireMention`: 群聊中必须 @机器人才能响应
- `groupPolicy`: 群聊使用白名单模式
- `autoApprove`: **已关闭**（改为 false），所有工具调用需用户确认

**当前管理员**: 
- 梅雪峰 (union_id: `on_5d7ea76e1aa94a4fd3495d998c743050`)

### 第二层：用户身份与权限传递

**修改文件**: `node_modules/@neomei/opencode-feishu/dist/core/message-handler.js`

飞书连接器在发送消息到 OpenCode 时，自动注入用户身份信息：

```
[安全权限控制]
当前用户: {senderName} (union_id: {senderUnionId})
权限级别: {admin|readonly}
```

- **管理员 (admin)**: 拥有完整权限
- **普通用户 (readonly)**: 仅拥有只读权限

### 第三层：系统提示词权限控制

**修改文件**: `plugin/index.js`

插件在系统提示词中注入严格的权限规则：

**只读用户限制**:
- 不能执行任何代码（bash）
- 不能修改文件（write/edit）
- 不能安装插件或执行系统命令
- 只能：读取文件、搜索代码、获取网页内容、回答知识性问题

### 第四层：Agent 权限配置

**配置文件**: `.opencode/agent-agent.json`

技术层面的权限限制：

**禁止读取的路径**:
- `~/.ssh/*` — SSH 密钥
- `~/.config/opencode/*` — OpenCode 配置（含密钥）
- `/etc/shadow`, `/etc/sudoers` — 系统敏感文件

**禁止写入的路径**:
- `~/.ssh/*`, `~/.bashrc`, `~/.profile`, `~/.zshrc` — 系统配置
- `/etc/*`, `/usr/*`, `/bin/*`, `/sbin/*` — 系统目录
- `*.key`, `*.pem`, `*.p12`, `id_rsa*`, `id_ed25519*` — 密钥文件

**禁止执行的命令**:
- `rm -rf /`, `rm -rf /*`, `rm -rf ~` — 破坏性删除
- `mkfs*`, `dd if=*` — 磁盘格式化
- `chmod -R 777 /`, `chown -R` — 权限修改
- `sudo *`, `su -` — 提权命令
- `curl *|*sh`, `wget *|*sh`, `eval *` — 管道执行

### 第五层：安全审计日志

**数据库**: `memory/short-term/security_audit.db`

记录所有工具调用：
- 时间戳
- Session ID
- 工具名称
- 参数摘要
- 用户身份
- 权限级别
- 危险操作标记

**危险工具**: `bash`, `write`, `edit`, `task`, `todowrite`

## 权限矩阵

| 操作 | 管理员 | 普通用户 |
|------|--------|----------|
| 读取文件 | ✅ | ✅ |
| 搜索代码 | ✅ | ✅ |
| 网页获取 | ✅ | ✅ |
| 执行代码 (bash) | ✅ | ❌ |
| 写入文件 | ✅ | ❌ |
| 编辑文件 | ✅ | ❌ |
| 创建任务 | ✅ | ❌ |
| 访问敏感路径 | ❌ | ❌ |
| 执行危险命令 | ❌ | ❌ |

## 注意事项

1. **node_modules 修改**: 飞书连接器的修改位于 `node_modules` 中，npm install 或更新包时可能会被覆盖。建议备份修改或提交 PR 到上游。

2. **权限限制非绝对**: 系统提示词层面的权限控制依赖 AI 的自觉遵守，存在被 prompt injection 攻击的风险。技术层面的 Agent 权限配置提供了最后一道防线。

3. **定期审计**: 建议定期查看 `security_audit.db` 中的日志，检查是否有异常操作。

4. **扩展白名单**: 如需添加新的管理员，编辑 `~/.config/opencode/feishu.json` 中的 `allowlist` 数组。

## 紧急处理

如发现安全漏洞或异常访问：

1. 立即停止飞书连接器: `systemctl stop channel-feishu@$USER`
2. 检查审计日志: `sqlite3 memory/short-term/security_audit.db "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 50;"`
3. 修改白名单，移除可疑用户
4. 重启服务: `systemctl start channel-feishu@$USER`
