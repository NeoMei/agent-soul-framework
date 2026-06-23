#!/usr/bin/env bash
# 魂器心跳任务 wrapper — TypeScript 核心版
# 由 crontab 调用

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# 加载 .env
if [ -f ".env" ]; then
    set -a && source ".env" && set +a
fi

# 优先使用本地 hunqi-heartbeat，回退到全局命令
if [ -f "node_modules/.bin/agent-soul-heartbeat" ]; then
    ./node_modules/.bin/agent-soul-heartbeat >> heartbeat/runner.log 2>&1
elif command -v agent-soul-heartbeat &>/dev/null; then
    agent-soul-heartbeat >> heartbeat/runner.log 2>&1
else
    echo "未找到 agent-soul-heartbeat，请确保 @neomei/agent-soul-framework 已安装" >&2
    exit 1
fi
