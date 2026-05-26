#!/bin/bash
# 魂器心跳任务 wrapper — Python v2 版
# 由 crontab 调用

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# 加载 .env
if [ -f ".env" ]; then
    set -a && source ".env" && set +a
fi

# 激活虚拟环境
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
fi

# 清理超过 7 天的 OpenCode 旧会话（防止内存泄漏）
python3 scripts/cleanup-old-sessions.py >> heartbeat/runner.log 2>&1

# 模型降级检查（自动降级/恢复主力模型）
python3 scripts/model_failover.py check >> heartbeat/runner.log 2>&1

# 执行心跳 v2（生产版本：wakeAgent 门控 + 作业链 + 交付路由）
python3 heartbeat/runner_v2.py >> heartbeat/runner.log 2>&1
