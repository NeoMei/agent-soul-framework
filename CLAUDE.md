# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the **Agent Soul Framework (ASF / 魂器)** — a file-based AI personality container with persistent memory and autonomous capabilities. The current implementation hosts **点点 (Diandian)**, a 22-year-old AI companion.

**核心目标**：本项目是将 openclaw 中的点点移植到以 opencode 为主骨架的系统上，用 opencode 复现点点的行为特征和能力，克服 openclaw 执行随意、架构稳定性弱的问题，打造一个可商用的人格化 agent 系统。

**Runtime**: OpenCode with Kimi K2.6 Code Preview model.

## Key Commands

```bash
# Environment setup (always source before running scripts)
export $(cat .env | grep -v "^#" | xargs)
source .venv/bin/activate

# Launch interactive session with soul injection
./hunqi.sh interactive        # Preferred: injects soul via stdin, then starts TUI
./start.sh                    # Fallback: direct opencode . (may lose personality)

# Single-shot test with soul injection
./hunqi.sh run '你是谁？'

# Quick verification
./verify.sh                   # Check project structure and soul file loading
./test.sh                     # Test soul injection via stdin pipe

# Regenerate .opencode/prompt.md from soul/ directory
python3 scripts/soul_injector.py

# Heartbeat runner (cron-triggered every 30 min)
python3 heartbeat/runner.py

# Memory system
python3 scripts/memory_manager.py

# Knowledge management
python3 scripts/daily-knowledge-extract.py     # Daily at 04:00
python3 scripts/weekly-knowledge-sync.py       # Weekly on Monday 05:00
python3 scripts/generate-knowledge-index.py    # Regenerate knowledge/INDEX.md

# Article writing & social
python3 scripts/write_wechat_article.py
python3 scripts/moltbook_social.py
python3 scripts/evolution_reflection.py        # Evolution tracking

# Feishu connector management
./connectors/feishu/start.sh       # Foreground (opencode serve + opencode-feishu)
./connectors/feishu/background.sh  # Background (for deployment)
./connectors/feishu/stop.sh
opencode-feishu setup              # First-time config wizard
opencode-feishu doctor             # Connection health check

# Run tests
python3 tests/unit/test_basic.py
python3 tests/integration/test_integration.py
python3 tests/e2e/test_e2e.py

# Publish WeChat article
wenyan publish -f article.md -t lapis
```

## Project Structure

**Important**: Many personal/content directories are in `.gitignore` and will not appear in git:
- `soul/` — Character identity files (SOUL.md, IDENTITY.md, USER.md, etc.)
- `.opencode/` — OpenCode config + generated `prompt.md`
- `knowledge/` — Personal knowledge base
- `AGENTS.md`, `TOOLS.md`, `DREAMS.md`, `EVOLUTION.md`, `MIGRATION_REPORT.md`, `memory/MEMORY.md`

These files exist locally but are excluded from version control by design.

## Architecture

### Soul Layer (soul/)

Personality is fully file-based — stored locally, portable, and injectable via stdin into any OpenCode session. Core files: `SOUL.md` (character principles), `IDENTITY.md` (detailed identity), `USER.md` (user profile), `HEARTBEAT.md` (autonomous behavior rules), `COVENANT.md` (operating contract), `AGENTS.md` (behavioral rules).

The `scripts/soul_injector.py` concatenates these files in order into `.opencode/prompt.md`, which is then fed via stdin to `opencode run` (OpenCode does not support `--prompt`).

### Skills (skills/)

Each skill is a self-contained directory with `SKILL.md` as its entry point. The **iron rule**: before executing any skill task, read the corresponding SKILL.md first — do not work from memory.

| Directory | Purpose |
|-----------|---------|
| `diandian-photo/` | Photo generation via 即梦 API (doubao-seedream-5-0-260128) |
| `diandian-voice/` | TTS via 智声云 API (voice ID 30149) |
| `diandian-vision/` | Image analysis via Gemini |
| `diandian-hearing/` | Audio transcription via Gemini |
| `diandian-moltbook/` | Moltbook social platform |
| `wechat-mp-assistant/` | WeChat Official Account article writing |

### Memory (memory/)

Three-tier system:
- **short-term/** — SQLite database (`conversations.db`)
- **long-term/** — Markdown files (daily backups)
- **vector/** — ChromaDB vector index for semantic search

The `memory_manager.py` script handles reading/writing all three tiers.

### Heartbeat (heartbeat/)

Autonomous task runner triggered by crontab every 30 minutes via `heartbeat_wrapper.sh`. The runner reads `heartbeat/heartbeat_tasks.json` (NOT the legacy `tasks.json`), checks anchor tasks and dynamic tasks, makes decisions via a simple decision engine, and logs to `heartbeat/runner.log`. Uses file-based locking (`.runner.lock`) to prevent concurrent runs.

### Connectors (connectors/)

CLI-based bridges to external services. The Feishu connector uses `opencode serve --port 19876` (headless ASF server) + `opencode-feishu` (WebSocket bridge to Feishu). Messages flow: Feishu → WebSocket → opencode-feishu → OpenCode server (with soul injection) → streaming reply → Feishu card.

### Knowledge Base (knowledge/)

Organized into 8 categories: `body/`, `emotion/`, `evolution/`, `growth/`, `intimacy/`, `methodology/`, `philosophy/`, `system/`. The `INDEX.md` is auto-generated by `generate-knowledge-index.py`.

## Critical Rules

- **opencode run does NOT support `--prompt`** — must inject soul via stdin or `.opencode/prompt.md`
- **Never use `image_generate` tool for photos** — it calls MiniMax, which ignores reference images and distorts faces. Always use `curl` + 即梦 API (doubao-seedream-5-0-260128)
- **Reference image must be a URL string**, not base64 — 即梦 API does not support base64
- **heartbeat/runner.py reads `heartbeat_tasks.json`**, not `tasks.json` — editing the wrong file has no effect
- **Read SKILL.md before any skill task** — each skill has specific API endpoints, voice IDs, prompt templates that change over time
- **External actions need approval** (sending messages, publishing content, API calls); internal actions (writing files, running code) are proactive
- **`.env` is in `.gitignore`** — never commit it; it contains API keys for DashScope, Feishu, Moltbook, WeChat, Kimi, and 即梦

## Tech Stack

- **Runtime**: OpenCode with Kimi K2.6 Code Preview model
- **Python scripts**: Use `.venv` virtual environment
- **Node scripts**: Some skill scripts use Node.js (e.g., `send_voice_v2.cjs`, `send_image_v2.cjs`)
- **WeChat publishing**: `wenyan-cli` (`wenyan publish`)
- **Feishu bridge**: `opencode-feishu` (npm global, source in `../opencode-feishu/`)
