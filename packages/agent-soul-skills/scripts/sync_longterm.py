#!/usr/bin/env python3
"""
长期记忆同步器 — 从 opencode sessions 同步对话到 memory/long-term/

将最近会话的对话摘要写入 long-term markdown 文件，
保持历史对话的书面记录。

用法：
  python3 scripts/sync_longterm.py              # 同步最近会话
  python3 scripts/sync_longterm.py --days 7      # 同步最近7天
  python3 scripts/sync_longterm.py --session <id> # 同步指定会话
"""

import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
LONG_TERM_DIR = PROJECT_DIR / "memory" / "long-term"
CONVERSATIONS_DB = os.path.join(PROJECT_DIR, "memory", "short-term", "conversations.db")

def now_beijing():
    return datetime.now(timezone(timedelta(hours=8)))

def find_recent_sessions(days=7):
    if not os.path.exists(CONVERSATIONS_DB):
        return []

    import sqlite3
    cutoff = (now_beijing() - timedelta(days=days)).timestamp()
    with sqlite3.connect(CONVERSATIONS_DB) as conn:
        rows = conn.execute(
            "SELECT DISTINCT session_id, MIN(timestamp) as first_ts FROM conversations "
            "WHERE timestamp > ? GROUP BY session_id ORDER BY first_ts DESC",
            (cutoff,)
        ).fetchall()
    return [(sid, first_ts) for sid, first_ts in rows]


def extract_user_messages(session_id):
    import sqlite3
    messages = []
    try:
        with sqlite3.connect(CONVERSATIONS_DB) as conn:
            rows = conn.execute(
                "SELECT role, content FROM conversations WHERE session_id = ? AND role='user' ORDER BY timestamp",
                (session_id,)
            ).fetchall()
            for role, content in rows:
                if content and len(content) > 5:
                    messages.append(content)
    except Exception:
        pass
    return messages

def sync_to_longterm(session_id):
    """从 conversations.db 将会话摘要写入 long-term"""
    date_str = now_beijing().strftime("%Y-%m-%d")
    output_file = LONG_TERM_DIR / f"{date_str}.md"

    messages = extract_user_messages(session_id)

    if not messages:
        return False

    entry = f"\n## {now_beijing().strftime('%H:%M')} | {session_id}\n\n"
    for i, msg in enumerate(messages[:10], 1):
        entry += f"{i}. {msg}\n"

    with open(output_file, "a", encoding="utf-8") as f:
        f.write(entry)

    return True

def main():
    days = 7
    for i, arg in enumerate(sys.argv[1:], 1):
        if arg == "--days" and i < len(sys.argv) - 1:
            days = int(sys.argv[i+1])
        elif arg == "--session" and i < len(sys.argv) - 1:
            session_id = sys.argv[i+1]
            ok = sync_to_longterm(session_id)
            print(f"[{'OK' if ok else 'SKIP'}] {session_id}")
            return

    sessions = find_recent_sessions(days)
    if not sessions:
        print("[INFO] 没有找到最近会话。")
        return

    synced = 0
    for sid, _ in sessions[:20]:
        ok = sync_to_longterm(sid)
        if ok:
            synced += 1

    print(f"[OK] 已同步 {synced} 个会话到 memory/long-term/")

if __name__ == "__main__":
    main()
