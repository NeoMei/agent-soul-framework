#!/usr/bin/env bash
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

# 使用单一 Python 脚本安全处理所有操作，避免注入
python3 - "$SESSIONS_FILE" "$DB_FILE" "$MAX_MESSAGES" <<'PYEOF'
import json, sqlite3, sys, os

sessions_file = sys.argv[1]
db_file = sys.argv[2]
max_messages = int(sys.argv[3])

with open(sessions_file, "r") as f:
    data = json.load(f)

sessions = data.get("sessions", [])
if not sessions:
    print("[session-cleanup] No sessions found")
    sys.exit(0)

conn = sqlite3.connect(db_file)
try:
    cleaned = 0
    remaining = []
    for s in sessions:
        sid = s.get("sessionId", "")
        cursor = conn.execute("SELECT COUNT(*) FROM message WHERE session_id = ?", (sid,))
        msg_count = cursor.fetchone()[0]

        if msg_count > max_messages:
            print(f"[session-cleanup] {sid} has {msg_count} messages > {max_messages}, removing mapping")
            cleaned += 1
        else:
            print(f"[session-cleanup] {sid} has {msg_count} messages <= {max_messages}, keeping")
            remaining.append(s)

    if cleaned > 0:
        data["sessions"] = remaining
        with open(sessions_file, "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"[session-cleanup] Cleaned {cleaned} session(s), next message will create new session")
    else:
        print(f"[session-cleanup] All sessions are within limit ({max_messages} messages)")
finally:
    conn.close()
PYEOF

if [ "$CLEANED" -gt 0 ]; then
    echo "[session-cleanup] Cleaned $CLEANED session(s), next message will create new session"
else
    echo "[session-cleanup] All sessions are within limit ($MAX_MESSAGES messages)"
fi
