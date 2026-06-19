#!/usr/bin/env bash
#
# 模型降级/恢复管理脚本
#
# 用法：
#   ./model-failover.sh degrade <fallback-model>   # 降级到备用模型
#   ./model-failover.sh restore                    # 恢复主模型
#   ./model-failover.sh status                     # 查看当前状态
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="${HOME}/.config/opencode/model-failover.json"
PRIMARY_MODEL="deepseek/deepseek-v4-pro"
OPENCODE_PORT="${OPENCODE_PORT:-19876}"

# 跨平台端口 PID 获取
get_pid_on_port() {
  local port="$1"
  if command -v lsof &>/dev/null; then
    lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1
  elif command -v ss &>/dev/null; then
    ss -tlnp 2>/dev/null | grep ":$port " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1
  else
    return 1
  fi
}

mkdir -p "$(dirname "$STATE_FILE")"

# 读取当前降级状态
read_state() {
  if [ -f "$STATE_FILE" ]; then
    cat "$STATE_FILE"
  else
    echo '{"degraded":false,"model":"","since":0}'
  fi
}

# 降级：切换模型
degrade() {
  local fallback_model="${1:-}"
  if [ -z "$fallback_model" ]; then
    echo "Usage: $0 degrade <fallback-model>" >&2
    exit 1
  fi

  python3 -c "import json,sys; json.dump({'degraded':True,'model':sys.argv[1],'since':int(sys.argv[2])}, open(sys.argv[3],'w'))" "$fallback_model" "$(date +%s)" "$STATE_FILE"
  echo "Model degraded to: ${fallback_model}"

  # 尝试重启 opencode serve（只杀指定端口的进程）
  SERVE_PID=$(get_pid_on_port "$OPENCODE_PORT")
  if [ -n "$SERVE_PID" ]; then
    echo "Restarting opencode serve (PID: $SERVE_PID) with fallback model..."
    kill "$SERVE_PID" 2>/dev/null || true
    sleep 2
    opencode serve --model "${fallback_model}" --port "${OPENCODE_PORT}" &
    echo "opencode serve restarted with ${fallback_model}"
  fi
}

# 恢复：尝试主模型
restore() {
  echo "Attempting to restore primary model: ${PRIMARY_MODEL}"

  # 先标记为恢复中
  python3 -c "import json,sys; json.dump({'degraded':False,'model':'','since':0}, open(sys.argv[1],'w'))" "$STATE_FILE"

  # 尝试重启 opencode serve 用主模型（只杀指定端口的进程）
  SERVE_PID=$(get_pid_on_port "$OPENCODE_PORT")
  if [ -n "$SERVE_PID" ]; then
    echo "Restarting opencode serve (PID: $SERVE_PID) with primary model..."
    kill "$SERVE_PID" 2>/dev/null || true
    sleep 2
    opencode serve --model "${PRIMARY_MODEL}" --port "${OPENCODE_PORT}" &
    echo "opencode serve restarted with primary model ${PRIMARY_MODEL}"
  fi
}

# 查看状态
status() {
  read_state
}

case "${1:-status}" in
  degrade) degrade "$2" ;;
  restore) restore ;;
  status)  status ;;
  *)
    echo "Usage: $0 {degrade <model>|restore|status}" >&2
    exit 1
    ;;
esac
