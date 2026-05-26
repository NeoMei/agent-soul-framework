#!/bin/bash
# session-cleanup.sh — 清理消息过多的飞书 session 映射
# 当 session 消息数超过阈值时，从 feishu-sessions.json 中移除映射
# 下次对话会自动创建新 session

set -e

SESSIONS_FILE="${HOME}/.config/opencode/feishu-sessions.json"
DB_FILE="${HOME}/.local/share/opencode/opencode.db"
MAX_MESSAGES="${MAX_MESSAGES_PER_SESSION:-50}"

if [ ! -f "$SESSIONS_FILE" ]; then
    echo "[session-cleanup] feishu-sessions.json not found"
    exit 0
fi

if [ ! -f "$DB_FILE" ]; then
    echo "[session-cleanup] opencode.db not found"
    exit 0
fi

# 读取当前 sessions
SESSIONS=$(cat "$SESSIONS_FILE")

# 检查每个 session 的消息数
CLEANED=0
for session_id in $(echo "$SESSIONS" | python3 -c "import sys,json; data=json.load(sys.stdin); print('\n'.join(s['sessionId'] for s in data.get('sessions',[])))"); do
    msg_count=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM message WHERE session_id = '$session_id';" 2>/dev/null || echo "0")
    
    if [ "$msg_count" -gt "$MAX_MESSAGES" ]; then
        echo "[session-cleanup] $session_id has $msg_count messages > $MAX_MESSAGES, removing mapping"
        # 从 feishu-sessions.json 中移除
        python3 -c "
import json, sys
with open('$SESSIONS_FILE', 'r') as f:
    data = json.load(f)
data['sessions'] = [s for s in data.get('sessions', []) if s['sessionId'] != '$session_id']
with open('$SESSIONS_FILE', 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
" 2>/dev/null
        CLEANED=$((CLEANED + 1))
    else
        echo "[session-cleanup] $session_id has $msg_count messages ≤ $MAX_MESSAGES, keeping"
    fi
done

if [ "$CLEANED" -gt 0 ]; then
    echo "[session-cleanup] Cleaned $CLEANED session(s), next message will create new session"
else
    echo "[session-cleanup] All sessions are within limit ($MAX_MESSAGES messages)"
fi
