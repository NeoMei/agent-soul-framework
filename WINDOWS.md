# 🪟 魂器 Windows 安装指南

魂器（Agent Soul Framework）支持 Windows / macOS / Linux 三平台运行。本文档补充 Windows 特有的注意事项。

---

## 环境要求

| 组件 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | ≥ 20 | nodejs.org 下载 LTS |
| npm | ≥ 10 | 随 Node.js 自带 |
| Python | ≥ 3.10 | 仅技能创建/ChromaDB 需要 |
| Git | 任意 | 可选 |

---

## 安装

### 方式一：npm 全局安装（推荐）

```powershell
npm install -g @neomei/agent-soul-framework
agent-soul-framework setup
```

### 方式二：源码安装

```powershell
git clone https://github.com/neomei/agent-soul-framework
cd agent-soul-framework
npm install
npm run build
```

---

## 配置通信通道

### 飞书

```powershell
npm install -g @neomei/opencode-feishu
opencode-feishu setup
```

### 企业微信

```powershell
npm install -g @neomei/opencode-qiwei
opencode-qiwei setup
```

---

## 启动

```powershell
# 一键启动（引擎 + 飞书 + 企微 + 心跳）
agent-soul-framework start

# 或分步
agent-soul-framework setup
agent-soul-framework start
```

---

## 心跳调度

Linux/macOS 用 crontab，Windows 用 Task Scheduler：

```powershell
$action = New-ScheduledTaskAction -Execute "npx" -Argument "agent-soul-heartbeat" -WorkingDirectory "C:\path\to\project"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration ([TimeSpan]::MaxValue)
Register-ScheduledTask -TaskName "HunqiHeartbeat" -Action $action -Trigger $trigger
```

---

## 平台差异速查

| 功能 | Linux | macOS | Windows |
|------|:-----:|:-----:|:-------:|
| npm 安装 | ✅ | ✅ | ✅ |
| opencode serve | ✅ | ✅ | ✅ |
| 飞书连接 | ✅ | ✅ | ✅ |
| 企微连接 | ✅ | ✅ | ✅ |
| 灵魂注入 | ✅ | ✅ | ✅ |
| 记忆搜索 | ✅ | ✅ | ✅ |
| ChromaDB 向量 | ✅ | ✅ | ⚠️ 需 Python |
| Hook 执行 | bash | bash | Node 原生 |
| TUI 交互模式 | ✅ | ✅ | ⚠️ 用 serve 模式 |
| 心跳调度 | crontab | crontab | Task Scheduler |
| systemd 守护 | ✅ | — | — |

---

## 常见问题

### 启动报错 "opencode 不是内部命令"

确保 opencode 已全局安装：

```powershell
npm install -g opencode-ai
```

### TUI 交互模式不可用

Windows 的 bash TUI 模式受限，使用 serve 模式替代：

```powershell
agent-soul-framework start
```

### 完全卸载

```powershell
npm uninstall -g @neomei/agent-soul-framework @neomei/opencode-feishu @neomei/opencode-qiwei
Remove-Item -Recurse -Force "$env:USERPROFILE\.config\opencode"
Remove-Item -Recurse -Force "$env:USERPROFILE\.agent-soul-framework"
```
