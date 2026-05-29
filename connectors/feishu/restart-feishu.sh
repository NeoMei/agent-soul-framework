#!/bin/bash
#
# restart-feishu.sh — 重启 opencode-feishu（飞书连接器）
# 策略：先起后杀 — 先启动新实例，再停止旧实例，避免飞书连接永久中断
#
set -e

PORT=${OPENCODE_PORT:-19876}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── 自动检测 opencode-feishu 启动方式 ──
resolve_opencode_feishu() {
    if command -v opencode-feishu &>/dev/null; then
        echo "opencode-feishu"
        return 0
    fi
    if command -v npx &>/dev/null; then
        echo "npx opencode-feishu"
        return 0
    fi
    if command -v npm &>/dev/null; then
        local npm_prefix
        npm_prefix=$(npm prefix -g 2>/dev/null)
        if [ -n "$npm_prefix" ] && [ -x "$npm_prefix/bin/opencode-feishu" ]; then
            echo "$npm_prefix/bin/opencode-feishu"
            return 0
        fi
    fi
    local src_paths=(
        "/home/$USER/文档/projects/opencode-feishu/bin/opencode-feishu"
        "$PROJECT_DIR/../opencode-feishu/bin/opencode-feishu"
    )
    for p in "${src_paths[@]}"; do
        if [ -f "$p" ]; then
            local node_cmd
            node_cmd=$(command -v node 2>/dev/null || echo "node")
            echo "$node_cmd $p"
            return 0
        fi
    done
    return 1
}

FEISHU_CMD=$(resolve_opencode_feishu) || {
    echo "❌ opencode-feishu 未安装" >&2
    exit 1
}

echo "🔄 准备重启 opencode-feishu..."

# ── 1. 获取旧实例 PID（排除当前 shell 和 grep）──
OLD_PID=$(pgrep -f "opencode-feishu start" | grep -v "$$" | head -1)

# ── 2. 在后台子 shell 中延迟启动新实例 ──
# 关键点：
#   • nohup + & 让新进程脱离当前终端
#   • sleep 2 给旧进程时间发送"正在重启"的回复
#   • 即使当前 shell 被 kill，新进程也能继续
(
    sleep 2
    cd "$PROJECT_DIR"

    # 确保 opencode serve 还在运行
    if ! curl -s http://localhost:$PORT/session >/dev/null 2>&1; then
        echo "⚠️  OpenCode serve 未运行，尝试启动..."
        nohup opencode serve --port "$PORT" > /tmp/opencode-serve.log 2>&1 &
        sleep 3
    fi

    # 启动新的 opencode-feishu
    nohup $FEISHU_CMD start --daemon > /tmp/opencode-feishu-restart.log 2>&1 &
    NEW_PID=$!

    # 等待新进程就绪
    sleep 3
    if kill -0 "$NEW_PID" 2>/dev/null; then
        echo "✅ 新 opencode-feishu 已启动 (PID: $NEW_PID)"
    else
        echo "❌ 新 opencode-feishu 启动失败，查看日志: /tmp/opencode-feishu-restart.log" >&2
        exit 1
    fi
) &

# ── 3. 给新进程启动时间，然后停止旧实例 ──
sleep 4

if [ -n "$OLD_PID" ]; then
    echo "🛑 停止旧实例 (PID: $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
    # 如果还在，强制 SIGKILL
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "   旧实例未响应，强制终止..."
        kill -9 "$OLD_PID" 2>/dev/null || true
    fi
fi

echo "✅ opencode-feishu 重启完成"
echo "   日志: tail -f /tmp/opencode-feishu-restart.log"
