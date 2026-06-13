#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PORT="${OPENCODE_PORT:-19876}"

if [ -f "$PROJECT_DIR/.env" ]; then
    set -a && source "$PROJECT_DIR/.env" && set +a
fi

# 自动检测 opencode-feishu 启动方式
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

echo "魂器 飞书连接器 — 停止"
echo ""

FEISHU_CMD=$(resolve_opencode_feishu) || true
if [ -n "$FEISHU_CMD" ]; then
    $FEISHU_CMD stop 2>/dev/null && echo "已停止 opencode-feishu" || echo "opencode-feishu 未在运行"
else
    echo "opencode-feishu 命令不可用，跳过插件停止"
fi

# 只杀监听指定端口的 opencode serve，避免误杀其他实例
SERVE_PID=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | sed -n 's/.*pid=\([0-9]*\).*/\1/p')
if [ -n "$SERVE_PID" ]; then
    kill "$SERVE_PID" 2>/dev/null && echo "已停止 opencode serve (PID: $SERVE_PID, 端口: $PORT)"
else
    echo "opencode serve 未在运行 (端口: $PORT)"
fi

sleep 1

if ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
    PID=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | sed -n 's/.*pid=\([0-9]*\).*/\1/p')
    if [ -n "$PID" ]; then
        PROC_NAME=$(ps -p "$PID" -o comm= 2>/dev/null || echo "unknown")
        echo "端口 ${PORT} 仍被占用 (PID: $PID, $PROC_NAME)，发送 SIGTERM..."
        kill "$PID" 2>/dev/null
        sleep 2
        if kill -0 "$PID" 2>/dev/null; then
            echo "进程 $PID 未响应 SIGTERM，跳过"
        fi
    fi
fi

echo "完成"
