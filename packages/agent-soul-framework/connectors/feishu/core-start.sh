#!/usr/bin/env bash
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
# 跨平台端口检查 (lsof > ss > netstat)
port_in_use() {
  if command -v lsof &>/dev/null; then
    lsof -iTCP:"$1" -sTCP:LISTEN -t &>/dev/null && return 0 || return 1
  elif command -v ss &>/dev/null; then
    ss -tlnp 2>/dev/null | grep -q ":$1 " && return 0 || return 1
  elif command -v netstat &>/dev/null; then
    netstat -an 2>/dev/null | grep -q ":$1 .*LISTEN" && return 0 || return 1
  fi
  return 1
}

for i in $(seq 1 10); do
  if ! port_in_use "$OPENCODE_PORT"; then
    break
  fi
  echo "  等待端口 $OPENCODE_PORT 释放... ($i/10)"
  sleep 1
done

# 启动 OpenCode serve
exec opencode serve --port "$OPENCODE_PORT"
