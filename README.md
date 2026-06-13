# 魂器 · Agent Soul Framework

> 基于 OpenCode 的 AI Agent 管理层框架。持久记忆 · 自主学习 · 多端部署 · 心跳自治

## 包结构

本仓库为 monorepo，包含以下包：

| 包名 | 说明 | 可选 |
|------|------|------|
| [`@neomei/agent-soul-framework`](packages/agent-soul-framework) | 魂器核心框架，含 OpenCode 灵魂注入插件，纯 TypeScript | 必需 |
| [`@neomei/agent-soul-skills`](packages/agent-soul-skills) | 技能插件包，含 Python 脚本 | 可选 |

## 安装

```bash
# 核心框架（必需，已内置灵魂注入）
npm install -g @neomei/agent-soul-framework

# 技能插件包（含 Python 脚本，可选）
npm install -g @neomei/agent-soul-skills
```

## 快速开始

```bash
hunqi init my-agent
cd my-agent
hunqi start
```

## 开发

```bash
npm install
npm run build
```

## License

MIT
