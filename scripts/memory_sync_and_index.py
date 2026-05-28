#!/usr/bin/env python3
"""
记忆同步与索引 — 心跳自动任务
每30分钟：消费消息队列 + 同步 OpenCode 对话 + 增量 FTS5 索引
"""

import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUEUE_DIR = os.path.join(PROJECT_DIR, "memory", ".queue")
QUEUE_FILE = os.path.join(QUEUE_DIR, "messages.jsonl")
CONVERSATIONS_DB = os.path.join(PROJECT_DIR, "memory", "short-term", "conversations.db")


def process_message_queue():
    """消费 plugin 写入的消息队列 — 批量入库，避免每条消息起 Python 进程"""
    if not os.path.exists(QUEUE_FILE):
        return 0

    count = 0
    tmp_file = QUEUE_FILE + ".processing"

    try:
        # 原子移动：防止 plugin 同时写入
        os.rename(QUEUE_FILE, tmp_file)

        with sqlite3.connect(CONVERSATIONS_DB) as conn:
            conn.execute("""CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT, role TEXT, content TEXT,
                timestamp REAL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")

            long_term_dir = os.path.join(PROJECT_DIR, "memory", "long-term")
            os.makedirs(long_term_dir, exist_ok=True)
            long_term_files = {}

            with open(tmp_file, "r", encoding="utf-8") as f:
                batch = []
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                        sid = msg["sessionID"]
                        role = msg["role"]
                        content = msg["content"]
                        ts = msg.get("time", time.time()) / 1000.0

                        if role in ("user", "assistant") and len(content) > 3:
                            exists = conn.execute(
                                "SELECT 1 FROM conversations WHERE session_id=? AND role=? AND content=? LIMIT 1",
                                (sid, role, content)
                            ).fetchone()
                            if not exists:
                                batch.append((sid, role, content, ts))
                                count += 1

                                date_str = time.strftime("%Y-%m-%d", time.localtime(ts))
                                if date_str not in long_term_files:
                                    path = os.path.join(long_term_dir, f"{date_str}.md")
                                    long_term_files[date_str] = open(path, "a", encoding="utf-8")
                                time_str = time.strftime("%H:%M:%S", time.localtime(ts))
                                long_term_files[date_str].write(f"\n## {time_str} | {role}\n\n{content[:300]}\n\n---\n")
                    except (json.JSONDecodeError, KeyError):
                        continue

            if batch:
                conn.executemany(
                    "INSERT INTO conversations (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
                    batch
                )
                conn.commit()

        for fh in long_term_files.values():
            fh.close()
        os.remove(tmp_file)

    except Exception as e:
        print(f"[QUEUE] 处理失败: {e}")
        # 恢复队列文件
        if os.path.exists(tmp_file):
            try:
                shutil.copy(tmp_file, QUEUE_FILE)
                os.remove(tmp_file)
            except Exception:
                pass

    if count:
        print(f"[QUEUE] 消费 {count} 条消息")
    return count


def run(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60, cwd=PROJECT_DIR)
    return result.stdout.strip() + result.stderr.strip()


def main():
    # 1. 消费消息队列
    process_message_queue()

    # 2. 同步 OpenCode 对话
    print("[SYNC] 同步 OpenCode 对话...")
    out = run([sys.executable, "scripts/memory_manager.py", "sync"])
    print(out)

    # 3. 增量 FTS5 索引
    print("[INDEX] 增量 FTS5 索引...")
    out = run([sys.executable, "scripts/memory_structured.py", "index", "--limit=20"])
    print(out)

    print("[DONE] 记忆同步完成")


if __name__ == "__main__":
    main()
