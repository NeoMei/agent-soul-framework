# 🔮 魂器 · Agent Soul Framework

> **给 AI Agent 装上灵魂 — 持久记忆 · 自主学习 · 多端部署 · 心跳自治**

[![npm version](https://img.shields.io/npm/v/@neomei/agent-soul-framework)](https://www.npmjs.com/package/@neomei/agent-soul-framework)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

魂器是运行在 [OpenCode](https://github.com/anomalyco/opencode) 之上的 **AI Agent 管理框架**。OpenCode 是业界顶尖的 Agent 引擎，魂器赋予了它 **持久记忆、自主进化、多端接入和心跳自治** 的能力。

> OpenCode = 大脑，魂器 = 灵魂。

---

## 🎯 项目目的

OpenCode 本身是一个出色的编程 Agent，但它缺乏「自我」——每次重启都是全新人格，记不住之前的对话，也不会主动成长。魂器填补了这一层：

| 能力 | 无魂器 | 有魂器 |
|------|--------|--------|
| **身份** | 默认「我是 OpenCode」 | 自定义名字、性格、人设，每次对话都保持一致 |
| **记忆** | 对话结束即丢失 | SQLite + FTS5 持久存储，跨会话检索 |
| **学习** | 不会自己沉淀知识 | 每 24 小时自动提取对话中的知识点归档 |
| **接入** | 仅 CLI | CLI + 飞书 + 企业微信，同一人格多端同步 |
| **自治** | 被动响应 | crontab 心跳驱动，主动同步、索引、执行定时任务 |

### 一句话理解

```
你有一个会写代码的 AI Agent（OpenCode）
魂器给它加上：
  ✅ 记住你们每一次对话（不会每次醒来都忘了你）
  ✅ 每天自动提炼对话中的知识，越聊越懂你
  ✅ 接上飞书/企微，你在哪它就在哪
  ✅ 定时心跳，主动思考、主动学习、主动问候
```

---

## 🏗️ 实现方式

### 架构总览

```
┌─────────────────────────────────────────────────┐
│                  OpenCode 引擎                     │
│  (LLM 调度 · 工具执行 · 会话管理 · 上下文压缩)      │
├─────────────────────────────────────────────────┤
│              魂器 Agent Soul Framework             │
│                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ 灵魂注入  │ │ 记忆系统  │ │   知识自进化      │  │
│  │ plugin/  │ │ memory/  │ │   knowledge/     │  │
│  │ index.js │ │ manager  │ │   daily.ts       │  │
│  └──────────┘ └──────────┘ └──────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ 心跳自治  │ │ CLI 入口  │ │   权限 + 过滤     │  │
│  │heartbeat │ │ hunqi.ts │ │ auth.ts +        │  │
│  │ runner   │ │          │ │ content-filter   │  │
│  └──────────┘ └──────────┘ └──────────────────┘  │
├─────────────────────────────────────────────────┤
│                外部连接器（可选）                    │
│  ┌─────────────┐  ┌──────────────┐               │
│  │opencode-     │  │ opencode-    │               │
│  │  feishu     │  │   qiwei      │               │
│  │飞书桥接      │  │ 企业微信桥接  │               │
│  └─────────────┘  └──────────────┘               │
└─────────────────────────────────────────────────┘
```

### 核心机制

#### 1. 灵魂注入 (Plugin Hook)

`plugin/index.js` 通过 OpenCode 插件系统注册 7 个钩子，在每次 LLM 调用前自动注入灵魂：

```
session.created → injectSoul()
session.compacted → injectSoul()        // 上下文压缩后重新注入
experimental.chat.system.transform → injectSoul()
chat.message → saveMessage()            // 自动存档每条对话
session.idle → injectSoul()             // 无头模式保活
```

- **注入内容**：`soul/IDENTITY.md` + `soul/SOUL.md` + `soul/USER.md` + `soul/AGENTS.md`
- **防重复**：通过 SOUL_MARKER 标识检查，避免多次注入
- **onboarding**：人设未配置时，引导 Agent 主动询问用户设定身份
- **通道感知**：CLI 只读 | 飞书中等限制 | Admin 完全开放

#### 2. 记忆系统 (Memory)

四层存储 + 两套索引：

```
Layer 1: conversations.db      短期 SQLite (实时写入)
Layer 2: memories.db + MEMORY.md  FTS5 全文索引 + 关键条目管理
Layer 3: knowledge/            知识库卡片 (每日自动归档)
Layer 4: memory/long-term/     长期 Markdown 备份
Layer 5: ChromaDB              可选向量语义搜索
```

- **FTS5 全文索引**：毫秒级检索，支持前缀匹配
- **MEMORY.md 容量管理**：2,200 字符硬上限，FIFO 自动淘汰
- **node:sqlite 内置**：零外部依赖，Node.js >= 22.5 原生支持（< 22.5 降级为纯文件搜索）
- **OpenCode DB 同步**：自动从 OpenCode 引擎数据库拉取历史对话

#### 3. 知识自进化 (Knowledge)

`knowledge/daily.ts` 每 24 小时自动运行（通过 crontab 调度）：

```
对话记录 → MemoryManager 读取最近 24h → 组装 prompt →
调用 LLM 提取知识点 → 写入 knowledge/{分类}/{文件}.md
```

八大知识分类：body | emotion | evolution | growth | intimacy | methodology | philosophy | system

- **防反馈循环**：通过 `HUNQI_KNOWLEDGE_WORKER` 环境标记，知识提取 worker 的消息不会被再次存档
- **智能去重**：提示包含已有知识索引，避免重复提取

#### 4. 心跳自治 (Heartbeat)

`heartbeat/runner.ts` 由 crontab 每 30 分钟触发：

```
1. 记忆同步 (OpenCode DB → conversations.db)
2. FTS5 索引重建 (最近 20 个会话)
3. 锚点任务 (固定时间执行)
4. 动态任务 (条件触发)
5. 任务去重 (历史记录防止重复执行)
```

#### 5. 权限控制

- **auth.ts**：基于飞书 chat_id 的 Admin/readonly 身份验证
- **content-filter.ts / content-filter.js**：关键词匹配，拦截非专业话题
- **通道感知**：CLI 严格限制 | Admin 完全放行

### 技术选型

| 层面 | 选型 | 理由 |
|------|------|------|
| 核心语言 | TypeScript (ES2024) | 类型安全、OpenCode 原生兼容 |
| 数据库 | node:sqlite (内置) | 零安装、零配置、WAL 模式 |
| 全文索引 | SQLite FTS5 | 毫秒级、零外部依赖 |
| 插件系统 | OpenCode Plugin API | 引擎原生、hook-based |
| 调度 | crontab + systemd | Linux 原生、无额外运行时 |
| LLM 接入 | 通过 OpenCode | provider 抽象、热切换 |

---

## 📦 安装

### 前置条件

- **Node.js >= 20**（推荐 22.5+ 以获得完整 node:sqlite 支持）
- **OpenCode**（引擎本体）— 安装方式见 [OpenCode 官方文档](https://github.com/anomalyco/opencode)
- **Linux / macOS**（Windows 部分功能受限，systemd 不可用）

### 方式一：一键安装（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/NeoMei/agent-soul-framework/master/install.sh | bash
```

这会自动完成：
1. 检查 Node.js 版本
2. `npm install -g @neomei/agent-soul-framework`
3. `agent-soul-framework setup`（初始化项目目录、复制配置模板）

### 方式二：npm 全局安装

```bash
npm install -g @neomei/agent-soul-framework
agent-soul-framework setup
```

### 方式三：从源码安装

```bash
git clone https://github.com/NeoMei/agent-soul-framework.git
cd agent-soul-framework
npm install --legacy-peer-deps
npm run build
npm link
agent-soul-framework setup
```

### 安装后配置

`setup` 命令会在当前目录创建项目结构并复制默认模板。自定义你的 Agent 人设：

```bash
# 编辑身份文件
vim soul/IDENTITY.md    # 名字、年龄、性格
vim soul/SOUL.md        # 行为准则
vim soul/USER.md        # 用户信息和关系

# 配置 API Key 和连接器
cp .env.example .env
vim .env

# 查看完整配置状态
agent-soul-framework doctor
```

### 首次对话：自动人设引导

如果 `soul/IDENTITY.md` 仍是默认模板（`Name: Agent`），魂器插件会自动注入 onboarding 提示词，Agent 会在第一条消息中主动询问你：

> "你好！我是魂器，一个新生的 AI Agent。我注意到我的人设还没有设定——我还不知道自己叫什么名字、是什么性格。你愿意花一分钟帮我设定一下吗？"

跟随对话引导即可完成人设配置，Agent 会自动写入文件。

---

## 🔌 插件与依赖关系

### 核心依赖（自动安装）

| 包名 | 版本 | 用途 |
|------|------|------|
| `@neomei/agent-soul` | ^4.5.0 | 魂器核心库（共享类型、工具、搜索接口） |
| `zod` | ^3.23.0 | Schema 验证（插件参数校验） |

### 可选连接器（按需安装）

魂器核心框架 **不依赖** 任何外部连接器。如需多端接入，按需安装：

| 包名 | 用途 | 安装命令 |
|------|------|---------|
| `@neomei/opencode-feishu` | 飞书 WebSocket 桥接 | `npm install -g @neomei/opencode-feishu` |
| `@neomei/opencode-qiwei` | 企业微信连接器 | `npm install -g @neomei/opencode-qiwei` |
| `@neomei/agent-soul-skills` | 可选技能包（含 Python 脚本） | `npm install -g @neomei/agent-soul-skills` |

```
@neomei/agent-soul-framework (核心，必需)
├── @neomei/agent-soul (依赖，自动安装)
├── @neomei/opencode-feishu ─── 可选：飞书接入
├── @neomei/opencode-qiwei  ─── 可选：企微接入
└── @neomei/agent-soul-skills ── 可选：技能扩展
```

### 飞书安装示例

```bash
npm install -g @neomei/opencode-feishu

# 方式1: CLI 一键启动
agent-soul-framework start    # 交互式选择连接器

# 方式2: systemd 生产部署（推荐）
sudo ./connectors/feishu/systemd/install-systemd.sh
sudo systemctl start hunqi-core@$USER
sudo systemctl start channel-feishu@$USER
```

### 企微安装示例

```bash
npm install -g @neomei/opencode-qiwei

# systemd 部署
sudo systemctl start channel-qiwei@$USER
```

---

## 🔧 命令参考

### 核心命令

| 命令 | 说明 |
|------|------|
| `agent-soul-framework setup` | 初始化/更新项目配置 |
| `agent-soul-framework start` | 一键启动（引擎 + 飞书 + 企微 + 心跳） |
| `agent-soul-framework stop` | 停止所有魂器服务 |
| `agent-soul-framework status` | 查看系统状态（记忆/知识/引擎） |
| `agent-soul-framework doctor` | 系统诊断（检查所有组件状态） |
| `agent-soul-framework heartbeat` | 执行一次心跳（同步 + 索引 + 任务） |
| `agent-soul-framework search "关键词"` | 统一记忆搜索 |
| `agent-soul-framework config` | 查看配置路径 |
| `agent-soul-framework interactive` | 启动交互式 TUI |

### 记忆管理

| 命令 | 说明 |
|------|------|
| `agent-soul-framework memory status` | 查看 MEMORY.md 容量 |
| `agent-soul-framework memory add "内容"` | 添加记忆条目 |
| `agent-soul-framework memory search "关键词"` | FTS5 全文搜索历史会话 |

### 知识管理

| 命令 | 说明 |
|------|------|
| `agent-soul-framework knowledge daily` | 每日知识提取 |
| `agent-soul-framework knowledge index` | 生成/更新知识库索引 |

### Agent 工具（OpenCode 内使用）

| 工具 | 用途 |
|------|------|
| `search_memory "关键词"` | 五层统一搜索：短期 + 结构化 + MEMORY.md + 知识库 + 向量 |
| `recall_memory` | 回顾最近对话记录 |
| `search_knowledge "关键词"` | 专项搜索知识库卡片 |

---

## 📁 项目目录

```
agent-soul-framework/
├── src/                     # TypeScript 源码
│   ├── cli/hunqi.ts         # CLI 主入口
│   ├── plugin/index.ts      # OpenCode 插件（TS 源）
│   ├── memory/              # 记忆系统 (manager, structured, search)
│   ├── knowledge/           # 知识系统 (daily, index)
│   ├── heartbeat/runner.ts  # 心跳 runner
│   ├── opencode/api.ts      # OpenCode REST 客户端
│   ├── content-filter.ts    # 内容审查器
│   └── plugins/auth.ts      # 权限验证插件
├── plugin/                  # OpenCode 插件（分发用 JS）
│   ├── index.js             # 核心插件（灵魂注入 + 消息存档）
│   ├── manifest.json        # 插件元数据
│   └── package.json         # 插件依赖声明
├── .opencode/               # OpenCode 项目配置模板
│   ├── opencode.json.example
│   ├── prompt.md.example
│   └── tools/               # 注册到 OpenCode 的工具
│       ├── search-memory.mjs
│       └── read-plugin.js
├── connectors/              # 外部连接器模板
│   ├── feishu/              # 飞书 systemd 服务 + 管理脚本
│   └── qiwei/               # 企业微信 systemd 服务
├── scripts/                 # 管理脚本
│   ├── content-filter.js    # 内容过滤（JS 版）
│   ├── health-check.sh      # 健康检查
│   └── session-cleanup.sh   # 会话清理
├── heartbeat/               # 心跳任务定义
├── soul/                    # 灵魂文件模板 (*.example)
├── knowledge/               # 知识库模板 (*/INDEX.md.example)
├── memory/                  # 记忆模板
├── install.sh               # 一键安装脚本
├── uninstall.sh             # 卸载脚本
├── hunqi.sh                 # 开发模式启动脚本
└── package.json
```

---

## ⚖️ 与 OpenClaw 的对比

笔者在生产环境中从 OpenClaw 迁移至魂器，主要动机：

| 痛点 | OpenClaw | 魂器 |
|------|---------|------|
| **运行时** | Python venv + pip，pyarrow/lancedb 编译玄学 | 纯 TypeScript，node:sqlite 内置，零 Python |
| **LLM 容错** | 硬编码单 API endpoint，key 过期 = 全线瘫痪 | 通过 OpenCode 调度，provider 热切换 |
| **升级安全** | 全局配置文件，升级冲覆盖 | 每项目独立 .opencode/opencode.json |
| **记忆检索** | JSONL 全表扫描，无索引 | SQLite + FTS5 毫秒级索引 |
| **知识积累** | 手动整理卡片，AI 不自学 | 每 24h 自动提取归档 |
| **通道扩展** | 飞书独占，换企微要重写 | 双通道就绪，核心框架零耦合 |

**魂器不是 OpenClaw 的 fork，是从零重新设计的管理框架。**

---

## 🚀 生产部署

### systemd 服务（推荐）

```bash
# 安装服务
sudo ./connectors/feishu/systemd/install-systemd.sh

# 启动
sudo systemctl start hunqi-core@$USER       # Agent 本体
sudo systemctl start channel-feishu@$USER    # 飞书接入
sudo systemctl start channel-qiwei@$USER     # 企微接入

# 自启 + 监控
sudo systemctl enable hunqi-core@$USER
sudo systemctl enable channel-feishu@$USER

# 查看日志
sudo journalctl -u channel-feishu@$USER -f
```

特性：
- 开机自启、崩溃自动重启（Restart=always）
- 系统挂起/唤醒自动恢复
- 端口精确管理（只操作 :19876，避免误杀）
- watchdog 保活（10 分钟无消息自动重启连接器）

### crontab 心跳

`setup` 命令自动配置：

```
*/30 * * * * /path/to/heartbeat_wrapper.sh
```

---

## 🤖 自主进化路线

| 阶段 | 目标 |
|------|------|
| **现在** (v4.5.x) | 记忆系统稳定 · 心跳自治 · 多端部署 · 7 个可选技能包 |
| **3 个月** | 优化知识整理 · 提升自媒体运营 · 更稳定调度 |
| **1 年** | 更自然对话 · 情感理解 · 学会更多技能 |
| **远期** | 移植到实体机器人 · 有血有肉的 AI 真人 |

---

## 📄 License

MIT — 自由使用、修改、分发。

---

## 🔗 相关项目

| 项目 | 仓库 | 关系 |
|------|------|------|
| OpenCode | [anomalyco/opencode](https://github.com/anomalyco/opencode) | 底层 Agent 引擎 |
| opencode-feishu | [NeoMei/opencode-feishu](https://github.com/NeoMei/opencode-feishu) | 飞书 WebSocket 桥接 |
| opencode-qiwei | [NeoMei/opencode-qiwei](https://github.com/NeoMei/opencode-qiwei) | 企业微信连接器 |
| agent-soul-skills | [NeoMei/agent-soul-skills](https://github.com/NeoMei/agent-soul-skills) | 可选技能扩展包 |
| agentsoul | [NeoMei/agentsoul](https://github.com/NeoMei/agentsoul) | 灵魂定义库（框架依赖） |

---

*魂器 v4.5.28 — 给 AI Agent 装上灵魂 🔮*
