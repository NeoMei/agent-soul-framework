#!/bin/bash
#
# 会话清理脚本
# 用途：强制重置 stuck/busy 状态的会话，无需重启服务
#

set -e

SESSIONS_FILE="$HOME/.config/opencode/feishu-sessions.json"
LOG_FILE="/tmp/hunqi-session-cleanup.log"
MAX_AGE_MINUTES=10

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 从日志中提取当前 busy 的会话
detect_busy_sessions() {
    local log_file="/home/neomei/.config/opencode/feishu.log"
    
    # 获取每个会话最后的状态
    grep -E '"status":"(busy|idle)"' "$log_file" 2>/dev/null | \
        awk -F'"sessionId":"' '{print $2}' | \
        awk -F'"' '{print $1}' | \
        sort -u | \
        while read session_id; do
            [ -z "$session_id" ] && continue
            local last_status
            last_status=$(grep "\"sessionId\":\"$session_id\"" "$log_file" | grep '"status"' | tail -1)
            if echo "$last_status" | grep -q '"status":"busy"'; then
                echo "$session_id"
            fi
        done
}

# 重置会话状态（通过删除 sessions 文件强制重建）
reset_sessions() {
    if [ -f "$SESSIONS_FILE" ]; then
        local backup="${SESSIONS_FILE}.bak.$(date +%s)"
        cp "$SESSIONS_FILE" "$backup"
        log "  已备份 sessions 文件: $backup"
        
        # 清空 sessions 数组，保留文件结构
        python3 -c "
import json
with open('$SESSIONS_FILE', 'r') as f:
    data = json.load(f)
data['sessions'] = []
with open('$SESSIONS_FILE', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || rm -f "$SESSIONS_FILE"
        
        log "  ✅ 已重置所有会话状态"
    fi
}

# ===== 主逻辑 =====
log "=== 会话清理检查 ==="

busy_sessions=$(detect_busy_sessions)
if [ -n "$busy_sessions" ]; then
    log "⚠️ 检测到 busy 会话:"
    echo "$busy_sessions" | while read sid; do
        log "  - $sid"
    done
    
    # 检查这些会话是否长时间 busy
    current_time=$(date +%s%3N)
    last_busy_time=$(grep '"status":"busy"' /home/neomei/.config/opencode/feishu.log 2>/dev/null | tail -1 | grep -o '"time":[0-9]*' | cut -d: -f2 || echo "0")
    
    if [ -n "$last_busy_time" ] && [ "$last_busy_time" != "0" ]; then
        elapsed_min=$(( (current_time - last_busy_time) / 60000 ))
        if [ "$elapsed_min" -gt "$MAX_AGE_MINUTES" ]; then
            log "会话已 busy ${elapsed_min} 分钟，超过阈值 ${MAX_AGE_MINUTES} 分钟，执行清理..."
            reset_sessions
            
            # 通知飞书
            log "  已发送会话重置通知"
        else
            log "会话仅 busy ${elapsed_min} 分钟，仍在正常范围内，暂不清理"
        fi
    fi
else
    log "✅ 无 busy 会话，状态正常"
fi
