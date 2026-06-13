#!/bin/bash
#
# hunqi-core - 魂器核心启动脚本
# 只启动 OpenCode headless server，不启动任何连接器
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ -f "$PROJECT_DIR/.env" ]; then
  set -a && source "$PROJECT_DIR/.env" && set +a
fi

cd "$PROJECT_DIR"

OPENCODE_PORT="${OPENCODE_PORT:-19876}"

echo "🎯 魂器核心 (hunqi-core)"
echo ""
echo "启动 OpenCode headless 服务器 (port $OPENCODE_PORT)..."

# 等待端口释放
if command -v ss &>/dev/null; then
  for i in $(seq 1 10); do
    if ! ss -tlnp | grep -q ":$OPENCODE_PORT "; then
      break
    fi
    echo "  等待端口 $OPENCODE_PORT 释放... ($i/10)"
    sleep 1
  done
fi

# 启动 OpenCode serve
exec opencode serve --port "$OPENCODE_PORT"
