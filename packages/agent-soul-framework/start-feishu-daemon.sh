#!/usr/bin/env bash
#
# start-feishu-daemon.sh - 稳定启动飞书连接器（守护进程模式）
# 解决终端超时信号导致的进程终止问题
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
LOG_FILE="${LOG_FILE:-/tmp/feishu-connector.log}"
PID_FILE="/tmp/hunqi-feishu.pid"

cd "$PROJECT_DIR"

# 加载环境变量
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a && source "$PROJECT_DIR/.env" && set +a
fi

OPENCODE_PORT="${OPENCODE_PORT:-19876}"

# ── 子命令处理 ──────────────────────────

if [ "$1" == "stop" ]; then
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "🛑 停止飞书连接器 (PID: $PID)..."
      kill -TERM "$PID" 2>/dev/null || true
      sleep 2
      if kill -0 "$PID" 2>/dev/null; then
        kill -KILL "$PID" 2>/dev/null || true
      fi
      rm -f "$PID_FILE"
      echo "✅ 已停止"
    else
      echo "⚠️ 进程已不存在"
      rm -f "$PID_FILE"
    fi
  else
    echo "⚠️ 未找到 PID 文件，尝试查找并终止..."
    pkill -f "opencode-feishu start" 2>/dev/null || true
    echo "✅ 已尝试终止"
  fi
  exit 0
fi

if [ "$1" == "status" ]; then
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "✅ 飞书连接器运行中 (PID: $PID)"
      echo "📄 最新日志:"
      tail -5 "$LOG_FILE"
    else
      echo "❌ 进程已死亡 (PID: $PID)"
    fi
  else
    echo "❌ 飞书连接器未运行"
  fi
  exit 0
fi

# ── 启动逻辑 ────────────────────────────

echo "🚀 启动魂器飞书连接器（守护进程模式）..."
echo "   日志: $LOG_FILE"
echo "   PID:  $PID_FILE"
echo ""

# 检查是否已在运行
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "⚠️ 飞书连接器已在运行 (PID: $OLD_PID)"
    echo "   如需重启，请先执行: $0 stop"
    exit 1
  fi
fi

# 等待 OpenCode server 就绪
echo "检查 OpenCode server (port $OPENCODE_PORT)..."
for i in $(seq 1 30); do
  if curl -s "http://localhost:$OPENCODE_PORT/session" >/dev/null 2>&1; then
    echo "✅ OpenCode server 已就绪"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "❌ OpenCode server 未启动，请先启动核心:"
    echo "   opencode serve --port $OPENCODE_PORT"
    exit 1
  fi
  sleep 1
done

# 清理旧日志
> "$LOG_FILE"

# 使用 setsid + nohup 启动，完全脱离终端会话
# setsid: 创建新会话，忽略 SIGHUP
# nohup: 忽略挂起信号
FEISHU_BIN="$(command -v opencode-feishu || echo "$HOME/.npm-global/bin/opencode-feishu")"
nohup "$FEISHU_BIN" start >> "$LOG_FILE" 2>&1 &
disown %1 2>/dev/null || true

# 等待进程真正启动并验证
sleep 3
FEISHU_PID=$(pgrep -f "opencode-feishu start" | head -1)
if [ -n "$FEISHU_PID" ] && kill -0 "$FEISHU_PID" 2>/dev/null; then
  # 检查日志确认连接成功
  for i in $(seq 1 20); do
    if grep -q "Feishu event stream connected" "$LOG_FILE" 2>/dev/null; then
      echo "$FEISHU_PID" > "$PID_FILE"
      echo "✅ 飞书连接器启动成功 (PID: $FEISHU_PID)"
      echo "   事件流已连接"
      exit 0
    fi
    if ! kill -0 "$FEISHU_PID" 2>/dev/null; then
      break
    fi
    sleep 1
  done
fi

echo "❌ 飞书连接器启动失败，查看日志:"
echo "   tail -20 $LOG_FILE"
exit 1
