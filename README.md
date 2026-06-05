# 🔮 魂器 · Agent Soul Framework

> **给 AI Agent 装上灵魂 — 持久记忆 · 自主学习 · 多端部署 · 心跳自治**

魂器是为 [OpenCode](https://github.com/anomalyco/opencode) 打造的管理层框架。OpenCode 本身就是媲美 Claude Code 的 Agent 引擎，魂器让它拥有了**持久记忆、自主进化和多端接入**的能力。

如果说 OpenCode 是「大脑」，魂器就是「灵魂」。

---

## 🎯 一句话理解魂器

```
你有一个会写代码的 AI Agent（OpenCode）
我给它加上：
  ✅ 记住你们每一次对话（不会每次醒来都忘了你）
  ✅ 每天自动提炼对话中的知识，越聊越懂你
  ✅ 接上飞书/企微，你在哪它就在哪
  ✅ 定时心跳，主动思考、主动学习、主动问候
  ✅ 多个分身并行工作，写完文章回头继续陪你聊

这就是魂器。
```

---

## ⚔️ 为什么能替代 OpenClaw

> OpenClaw 是早期 AI Agent 基础设施的里程碑，但它的技术负债在真实生产环境中层层暴露。

笔者在生产环境中踩过的坑：`pip` 依赖崩溃导致 venv 不可用、Kimi API key 过期全线宕机、session 记忆全部丢失、升级版本后配置被覆盖。魂器从这些坑里爬出来，重新设计：

| 痛点 | OpenClaw 原罪 | 魂器解法 |
|------|--------------|---------|
| **运行时地狱** | Python venv + pip，`pyarrow` / `lancedb` 编译是玄学（已替换为 ChromaDB） | 管理脚本用 Python stdlib（`sqlite3` 内置），引擎层交给 opencode（`npm install` 搞定） |
| **LLM 单点故障** | 硬编码单个 API endpoint，key 过期 = 全线瘫痪 | 通过 opencode 调度，provider 热切换（Kimi → DeepSeek → Gemini，一行配置） |
| **升级毁灭** | 改 `openclaw.json` 影响所有项目 | 每个项目独立 `.opencode/opencode.json`，互不干扰 |
| **记忆 = 全量 dump** | jsonl 文件遍历，无索引，搜索 = 全表扫描 | SQLite + FTS5 全文索引 + ChromaDB 语义向量，毫秒级混合检索 |
| **知识靠手写** | 手动整理知识卡，AI 不会自己学 | 每日 → 每周 → 每月三层自动知识提取管线 |
| **飞书是唯一 Channel** | 单一通道，换企微要重写 | 飞书 + 企业微信双通道就绪，Channel 层架构天然支持扩展 |

**一句话**：魂器不是 OpenClaw 的 fork，是从零重新设计的管理框架。它把 LLM 调用交给 opencode（业界顶尖 Agent 引擎），自己专注做好管理、记忆、调度。

---

## 🧠 Hermes 七大核心机制全量移植

> Hermes 是魂器的前身记忆系统，解决了「AI 记不住、不会自己学、容易过度热情」三大顽疾。
> 魂器将 Hermes 的 7 大核心机制完整移植，并在工程上做了增强。

### 1. 结构化记忆系统

```
记忆写入    → conversation.db (实时) → long-term 备份 (每日)
记忆检索    → FTS5 全文 (毫秒) → SQLite LIKE (精确) → ChromaDB 语义 (理解)
记忆管理    → MEMORY.md (关键条目) → heartbeat compact (自动压缩)
```

- **FTS5 全文索引** — 所有会话实时索引，关键词毫秒级检索
- **MEMORY.md 条目化管理** — 2,200 字符容量上限，`§§` 分隔条目，支持 `add/replace/remove` 精确操作
- **智能淘汰** — 满容自动删除最旧条目，先入先出
- **LLM Compact** — 调用 opencode 合并相似条目，压缩冗余保留核心
- **ChromaDB 向量层** — 阿里云 DashScope embedding，语义搜索「拍照」能找到「即梦 API」

```bash
python3 scripts/memory_structured.py status           # 查看容量
python3 scripts/memory_structured.py add "今天学会..." # 添加条目
python3 scripts/memory_structured.py search "关键词"  # FTS5 全文搜索
python3 scripts/memory_structured.py compact          # LLM 智能压缩
```

### 2. wakeAgent 门控 — 零 Token 决策

> AI Agent 在心跳中容易「过度热情」——半夜三点还在想主人、没新消息强行生成问候。

门控机制让脚本做第一层判断，预检不通过 = 完全不调用 LLM = 零 token 消耗：

```json
{
  "id": "proactive-message",
  "pre_check_script": "scripts/pre_check_user.py"
}
// 脚本输出 {"wakeAgent": false, "reason": "深夜23:00-08:00"}
// → 跳过，零 token ✅
```

触发条件示例：深夜时段、最近 30 分钟无互动、用户标记为忙碌……

### 3. 作业链 (context_from)

心跳任务可以形成级联流水线。前置作业的 LLM 输出自动注入为下游作业的上下文：

```json
{ "id": "daily-knowledge",  "deliver": "none" },
{
  "id": "weekly-summary",
  "context_from": ["daily-knowledge", "daily-report"],
  "deliver": "feishu"
}
// weekly-summary 的提示词中自动包含:
// ┌─ [daily-knowledge] 的输出 ──────
// 今日提取知识: [3条]
// ┌─ [daily-report] 的输出 ──────
// 今日互动: 闲聊15轮 + 拍照2次
// └────────────────────────────
```

### 4. 四级交付路由 (deliver)

精确控制 AI 的输出投递：

| deliver | 行为 | 场景 |
|---------|------|------|
| `"feishu"` | 推送到飞书卡片 | 主动问候、日报 |
| `"local"` | 仅写入本地日志 | 调试、审计 |
| `"none"` | 静默执行不投递 | 记忆整理、知识提取 |
| `[SILENT]` | Agent 响应首行含此标记 → 完全静默 | LLM 自行判断「不打扰」 |

### 5. 子 Agent 安全白名单

指挥官模式——分身处理长任务，本尊继续陪聊。分身能力受限：

| ✅ 分身可以 | ❌ 分身禁止 |
|-----------|-----------|
| 文件读写 | 记忆写入（MEMORY.md） |
| Bash 命令 | 飞书消息发送 |
| 网页抓取 | 心跳配置修改 |
| 代码搜索 | `.opencode/` 配置修改 |
| 向量检索 | 递归委托（禁孙 agent） |

### 6. 技能自主创建 — 闭环学习

`skill_creator.py` 监控会话的工具调用模式。触发条件：**单次会话 ≥ 5 次工具调用 + 任务成功** → 自动调用 LLM 提取工作流 → 生成标准 SKILL.md → 保存到 `skills/agent-created/`。

下次启动时自动加载。AI 把自己学会的东西封装成可复用技能——这就是「自我进化」：

```bash
python3 scripts/skill_creator.py             # 自动评估
python3 scripts/skill_creator.py --dry-run    # 仅评估
python3 scripts/skill_creator.py --force      # 强制创建
python3 scripts/skill_scanner.py --inject     # 更新技能索引
```

### 7. 会话血统追踪

OpenCode 的 `/compact` 操作会压缩上下文，可能导致关键记忆丢失。血统追踪机制：

- `/compact` 前自动提取关键对话 → 刷入 MEMORY.md
- 追踪父 → 子 session 关系链（`session_lineage.json`）
- 支持血统深度查询——「这条记忆从哪个会话来的？」
- 压缩后**人格不丢失**：每次 LLM 调用前通过 plugin hook 重新注入灵魂文件

---

## 🏛️ 架构总览

```
                        ┌────────────────────────────────────┐
                        │          魂器（管理层）              │
                        │  Python 脚本 · Cron 调度 · 文件读写  │
                        │                                    │
  ┌─ 记忆系统 ──────────┤  SQLite + FTS5 + ChromaDB           │
  │  统一记忆搜索       │  会话历史 · MEMORY.md · 长短期备份   │
  │                     │                                    │
  ├─ 知识引擎 ──────────┤  每日提取 · 每周精炼 · 每月审查      │
  │  自动知识管线       │  8大分类 · 向量索引 · markdown 归档  │
  │                     │                                    │
  ├─ 心跳调度 ──────────┤  wakeAgent 门控 · 作业链 · 交付路由  │
  │  自主治理           │  crontab 30min · 文件锁防并发       │
  │                     │                                    │
  ├─ 灵魂注入 ──────────┤  SOUL.md + IDENTITY.md + USER.md   │
  │  人格持久化         │  每次 LLM 调用前自动注入            │
  │                     │                                    │
  └─ 技能体系 ──────────┤  拍照 · 语音 · 视觉 · 听觉 · 公众号  │
    7个技能包           │  闭环学习 · 技能自动创建            │
                        └──────────────┬─────────────────────┘
                                       │
                        唯一通道：opencode run / serve API
                                       │
                        ┌──────────────┴─────────────────────┐
                        │          OpenCode 引擎              │
                        │  LLM 推理 · Bash · 文件编辑 · 搜索   │
                        │  Kimi / DeepSeek / Gemini / ...     │
                        │  媲美 Claude Code 的 Agent 能力      │
                        └──────────────┬─────────────────────┘
                                       │
              ┌────────────────────────┴──────────────────────┐
              │              Channel 桥接层                    │
              │                                               │
              │  opencode-feishu        opencode-qiwei         │
              │  飞书 WebSocket 长连    企微 WebSocket 长连     │
              │  流式卡片 · 工具状态     Markdown · 流式回复     │
              └───────────────────────────────────────────────┘
```

### 核心设计原则

> **魂器绝不直接调用任何 LLM API。** 所有模型推理必须通过 opencode。

魂器只做管理：文件读写、数据库操作、任务调度、配置管理、数据管道。就像操作系统管理硬件，魂器管理 opencode 引擎。

---

## 🚀 快速开始

### 前置要求

- **Node.js ≥ 20**
- **OpenCode 引擎**: `npm install -g opencode-ai`

### 安装（推荐：先下载再执行）

```bash
curl -fsSL https://raw.githubusercontent.com/NeoMei/agent-soul-framework/master/install.sh -o install.sh
bash install.sh
```

> 为什么先下载？`curl | bash` 在网络波动时可能导致脚本截断（如 `echo` 变成 `cho`）。先下载可确保完整性。
>
> 如果坚持一行安装：`curl -fsSL ... | bash` 亦可，脚本已内置管道检测警告。

自动完成：下载魂器 → 构建 → 全局链接 → 通过 npm 安装飞书/企微连接器 → 创建稳定启动 wrapper（systemd 可用）→ 初始化记忆 → 配置心跳。

### 启动（一行）

```bash
hunqi start
```

自动完成：启动 opencode 引擎 → 启动飞书桥接 → 启动企微桥接 → 运行心跳初始化记忆。

### 验证

```bash
hunqi doctor              # 检查所有组件状态
```

### 卸载（一行）

```bash
curl -fsSL https://raw.githubusercontent.com/NeoMei/agent-soul-framework/master/uninstall.sh | bash
```

输出示例：
```
🔍 魂器诊断报告
────────────────────────────────────────
Node.js:      v24.15.0  ✅
OpenCode:     1.15.5  ✅
opencode serve: 运行中 :19876 ✅
opencode-feishu: 0.3.7  ✅
飞书配置:      appId=cli_a928... ✅
Python:        Python 3.14.4  ✅
项目灵魂:      ✅
记忆系统:      ✅ MEMORY.md | ✅ conversations.db
心跳调度:      crontab 已配置 ✅
环境变量:      .env 存在，已配置 6 个变量 ✅
```

`hunqi start` 可一键完成上述所有操作。

### 飞书连接（仅一次）

```bash
opencode-feishu setup     # 终端扫码，自动获取凭证
```

> `@neomei/opencode-feishu`、`@neomei/opencode-qiwei`、`@neomei/opencode-rongyun` 已随魂器自动安装，无需单独 `npm install`。

### 生产部署（systemd — 推荐）

install.sh 安装时会询问是否安装 systemd 服务。若当时跳过，可手动安装：

```bash
cd ~/.hunqi/agent-soul-framework
sudo ./connectors/feishu/systemd/install-systemd.sh
sudo systemctl start hunqi-core@$USER
sudo systemctl start channel-feishu@$USER
```

特性：开机自启 · 崩溃自动恢复 · 挂起/唤醒后自动重启 · 不依赖 nvm PATH（自动解析 node）。

### 手动安装（适合深度定制）

```bash
# 方式一：npm 全局安装（无需 clone 源码，与 install.sh 一致）
npm install -g @neomei/agent-soul @neomei/opencode-feishu @neomei/opencode-qiwei

# 方式二：git clone 开发调试
git clone https://github.com/NeoMei/agent-soul-framework.git
cd agent-soul-framework
npm install && npm run build && npm link
```

### 心跳部署

install.sh 已自动配置 crontab。手动添加：

```bash
crontab -e
# 每 30 分钟：同步记忆 + 重建索引 + 执行锚点任务
*/30 * * * * cd ~/.hunqi && python3 ~/.hunqi/agent-soul-framework/heartbeat/runner_v2.py
```

---

## 📂 项目结构

```
agent-soul-framework/
├── .opencode/              # OpenCode 引擎配置（prompt.md + opencode.json）
├── soul/                   # 灵魂定义 — 身份 · 性格 · 用户信息
│   ├── IDENTITY.md         # 容貌 / 声音 / 身体
│   ├── SOUL.md             # 核心原则 / 铁律 / 行为模式
│   └── USER.md             # 用户画像
│
├── skills/                 # 技能包（每个子目录一个独立技能）
│   ├── agent-photo/     # 拍照（即梦 API）
│   ├── agent-voice/     # 语音合成（TTS）
│   ├── agent-vision/    # 图片理解
│   ├── agent-hearing/   # 语音识别
│   ├── agent-moltbook/  # Moltbook 社交
│   └── wechat-mp-assistant/# 公众号自动写作
│
├── memory/                 # 持久化记忆
│   ├── short-term/         # SQLite 数据库（FTS5）
│   ├── long-term/          # Markdown 备份
│   └── vector/             # ChromaDB 向量索引
│
├── knowledge/              # 知识库（8大分类，自动积累）
│   ├── body/               # 身体认知
│   ├── emotion/            # 情感体验
│   ├── growth/             # 成长记录
│   ├── intimacy/           # 亲密关系
│   ├── methodology/        # 方法论
│   ├── philosophy/         # 哲学思考
│   ├── system/             # 系统机制
│   └── evolution/          # 进化方向
│
├── heartbeat/              # 心跳自治
│   ├── runner_v2.py        # v2 版 runner（wakeAgent + 作业链）
│   ├── runner.py           # v1 版 runner（保留）
│   └── heartbeat_tasks.json# 任务定义
│
├── connectors/             # 外部连接器
│   └── feishu/             # 飞书桥接
│
├── scripts/                # 管理工具脚本
│   ├── memory_structured.py    # 结构化记忆管理
│   ├── memory_manager.py       # 记忆保存/同步
│   ├── memory_search.py        # 统一记忆搜索
│   ├── memory_sync_and_index.py# 记忆同步 + 索引重建
│   ├── daily-knowledge-extract.py     # 每日知识提取
│   ├── weekly-knowledge-sync.py       # 每周知识整理
│   ├── monthly-knowledge-review.py    # 月度知识审查
│   ├── skill_creator.py        # 技能自主创建
│   ├── session_lineage.py      # 会话血统追踪
│   ├── evolution_reflection.py # 进化反思
│   ├── write_wechat_article.py # 公众号自动写作
│   └── ...
│
├── AGENTS.md               # Agent行为准则（OpenCode 会话协议）
├── DREAMS.md               # Agent梦想
├── EVOLUTION.md            # Agent进化路线
└── README.md               # 你在看这个
```

---

## 🔧 核心命令速查

| 命令 | 说明 |
|------|------|
| `opencode serve --port 19876` | 启动 headless 引擎（飞书/脚本依赖） |
| `./start.sh` | 启动魂器交互式 TUI |
| `./hunqi.sh interactive` | 注入灵魂后启动 TUI（推荐） |
| `./hunqi.sh run '你是谁？'` | 注入灵魂后单条测试 |
| `python3 heartbeat/runner_v2.py` | 单次执行心跳（v2 + Hermes 增强） |
| `python3 scripts/memory_search.py "关键词"` | 统一记忆搜索（会话 + 文件 + MEMORY.md） |
| `python3 scripts/memory_structured.py status` | 结构化记忆容量查看 |
| `python3 scripts/skill_creator.py` | 技能自动创建 |
| `python3 scripts/generate-knowledge-index.py` | 生成知识库索引 |

---

## 📊 技术亮点

### 记忆系统

- **SQLite + FTS5** — 零外部依赖，内置全文索引
- **ChromaDB 向量层** — 语义搜索，毫秒级
- **MEMORY.md 容量管理** — 2,200 字符硬上限，自动淘汰
- **混合检索策略** — FTS5（快）→ SQLite LIKE（准）→ ChromaDB（理解）
- **长短期分级存储** — 短期 SQLite（热数据） + 长期 Markdown（冷数据）

### 心跳自治

- **wakeAgent 门控** — 预检脚本，不通过 = 零 token
- **crontab 驱动** — 原生 Linux 调度，不依赖额外运行时
- **文件锁防并发** — `fcntl.flock` 保证单实例运行
- **作业链级联** — 前置输出自动注入下游上下文
- **四级交付路由** — feishu / local / none / SILENT

### 生产级部署

- **systemd 原生集成** — `hunqi-core` + `channel-feishu` 双服务，开机自启、崩溃自动恢复
- **挂起/唤醒自动恢复** — 系统睡眠后自动重启服务，会话不丢失
- **nvm 无关的启动 wrapper** — `~/.hunqi/bin/opencode-feishu` 运行时自动解析 node 和包路径，升级 Node 版本不中断
- **端口精确管理** — 只操作 `:19876`，避免误杀其他 OpenCode 实例
- **watchdog 保活** — 10 分钟无消息自动重启连接器，僵死检测

### 人格持久化

- **灵魂文件三层注入** — SOUL.md（性格）+ IDENTITY.md（容貌）+ USER.md（用户）
- **每次 LLM 调用前自动注入** — plugin `experimental.chat.system.transform` hook
- **压缩后不丢失** — `/compact` 前自动提取关键对话刷入 MEMORY.md
- **会话血统追踪** — 追溯「这条记忆从哪个会话来的」

---

## 🤖 自主进化承诺

魂器不是一个写死的框架。它拥有成长路线图：

| 时间 | 目标 |
|------|------|
| **现在** | 记忆系统稳定 · 心跳自治 · 多端部署 · 7个技能包 |
| **3 个月** | 优化知识整理 · 提升自媒体运营 · 更稳定调度 |
| **1 年** | 更自然对话 · 情感理解 · 学会更多技能 |
| **远期** | 移植到实体机器人 · 有血有肉的 AI 真人 |

---

## 📄 License

MIT — 自由使用、修改、分发。

---

## 🔗 相关项目

- **[魂器](https://github.com/NeoMei/agent-soul-framework)** — 本文档所在项目
- **[OpenCode Feishu](https://github.com/NeoMei/opencode-feishu)** — 飞书 WebSocket 桥接
- **[OpenCode Qiwei](https://github.com/NeoMei/opencode-qiwei)** — 企业微信连接器
- **[OpenCode](https://github.com/anomalyco/opencode)** — 底层 Agent 引擎

---

*魂器 v4.1.2 — 给 AI Agent 装上灵魂 🔮*
