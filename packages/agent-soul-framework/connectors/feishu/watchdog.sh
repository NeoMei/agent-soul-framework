#!/usr/bin/env bash
#
# 飞书连接器保活守护脚本 (v2 — 使用 opencode-feishu status --json)
#
# 问题：WSClient ping/pong 保持 TCP 存活，但飞书可能停止推送事件
# 方案：每 10 分钟检查状态，如僵死则重启 opencode-feishu（不动 opencode serve）

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_FILE="$HOME/.config/opencode/feishu.log"
RESTART_INTERVAL=600  # 10 分钟

# 自动检测 opencode-feishu 启动方式（npm link 在重启后经常断裂）
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
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ opencode-feishu 未安装，watchdog 无法运行"
    echo "请安装: npm install -g @neomei/opencode-feishu"
    exit 1
}

while true; do
  sleep "$RESTART_INTERVAL"

  # 检查 daemon 是否还活着
  STATUS=$($FEISHU_CMD status --json 2>/dev/null)
  if [ -z "$STATUS" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] opencode-feishu 状态获取失败，尝试重启..."
    $FEISHU_CMD start --daemon
    continue
  fi

  RUNNING=$(echo "$STATUS" | (python3 -c "import sys,json; print(json.load(sys.stdin).get('running',False))" 2>/dev/null || python -c "import sys,json; print(json.load(sys.stdin).get('running',False))" 2>/dev/null || echo "False"))
  if [ "$RUNNING" != "True" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] opencode-feishu 未在运行，启动..."
    $FEISHU_CMD start --daemon
    continue
  fi

  # 检查最近是否有收到消息（只检查最近 1000 行日志，避免大文件慢查询）
  NOW=$(date +%s)
  LAST_MSG=$(tail -n 1000 "$LOG_FILE" 2>/dev/null | grep "Received message" | tail -1)

  if [ -z "$LAST_MSG" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 超过 $((RESTART_INTERVAL/60)) 分钟无新消息，重启 opencode-feishu..."
    $FEISHU_CMD stop 2>/dev/null
    sleep 2
    $FEISHU_CMD start --daemon
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] opencode-feishu 已重启"
    continue
  fi

  LAST_TIME=$(echo "$LAST_MSG" | (python3 -c "import sys,json; print(json.load(sys.stdin).get('time',0))" 2>/dev/null || python -c "import sys,json; print(json.load(sys.stdin).get('time',0))" 2>/dev/null || echo "0"))
  if [ -z "$LAST_TIME" ] || [ "$LAST_TIME" = "0" ]; then
      LAST_TIME_SEC=$NOW
  else
      LAST_TIME_SEC=$((LAST_TIME / 1000))
  fi
  ELAPSED=$((NOW - LAST_TIME_SEC))

  if [ "$ELAPSED" -ge "$RESTART_INTERVAL" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 超过 $((RESTART_INTERVAL/60)) 分钟无新消息，重启 opencode-feishu..."
    $FEISHU_CMD stop 2>/dev/null
    sleep 2
    $FEISHU_CMD start --daemon
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] opencode-feishu 已重启"
  fi

  # 日志文件超过 100MB 时截断保留最近 10000 行
  LOG_SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
  if [ "$LOG_SIZE" -gt 104857600 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 日志文件过大 (${LOG_SIZE} bytes)，截断保留最近 10000 行"
    tail -n 10000 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
  fi
done
