#!/usr/bin/env bash
#
# restart-serve.sh — 重启 opencode serve（OpenCode 核心服务）
# Usage: ./restart-serve.sh [port]
#
set -e

PORT=${1:-19876}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🔄 准备重启 opencode serve (port $PORT)..."

# ── 1. 停止现有的 opencode serve 进程 ──
# 使用 pgrep 精确匹配，避免误杀
OLD_PIDS=$(pgrep -f "opencode serve.*--port $PORT" || true)

if [ -n "$OLD_PIDS" ]; then
    echo "   发现现有进程: $OLD_PIDS"
    echo "$OLD_PIDS" | while read -r pid; do
        kill "$pid" 2>/dev/null || true
    done
    sleep 1

    # 确认旧进程已停止
    REMAINING=$(pgrep -f "opencode serve.*--port $PORT" || true)
    if [ -n "$REMAINING" ]; then
        echo "   强制停止残留进程: $REMAINING"
        echo "$REMAINING" | while read -r pid; do
            kill -9 "$pid" 2>/dev/null || true
        done
        sleep 1
    fi
fi

# ── 2. 启动新的 opencode serve ──
cd "$PROJECT_DIR"
nohup opencode serve --port "$PORT" > /tmp/opencode-serve.log 2>&1 &
NEW_PID=$!

echo "   新进程 PID: $NEW_PID"

# ── 3. 等待并验证 ──
sleep 2
RETRIES=5
while [ $RETRIES -gt 0 ]; do
    if curl -s http://localhost:$PORT/session >/dev/null 2>&1; then
        echo "✅ opencode serve 已就绪 (PID: $NEW_PID, port: $PORT)"
        exit 0
    fi
    sleep 1
    RETRIES=$((RETRIES - 1))
done

# 如果到这里还没就绪，检查进程是否还在
if kill -0 "$NEW_PID" 2>/dev/null; then
    echo "⚠️  opencode serve 进程存在但未响应，请检查日志: /tmp/opencode-serve.log"
    exit 1
else
    echo "❌ opencode serve 启动失败，查看日志: /tmp/opencode-serve.log"
    exit 1
fi
