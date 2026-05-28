#!/usr/bin/env python3
"""
Session Lineage Tracker — Hermes 风格会话血统追踪

追踪父→子 session 关系，在上下文压缩时保护记忆。
功能：
1. 记录每次 /compact 的父-子关系
2. 压缩前自动将关键对话刷入 MEMORY.md
3. 查询会话血统链

用法：
  python3 scripts/session_lineage.py track <parent_id> <child_id>
  python3 scripts/session_lineage.py lineage <session_id>
  python3 scripts/session_lineage.py pre-compact <session_id>  # 压缩前钩子
"""

import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
LINEAGE_FILE = os.path.expanduser("~/.config/opencode/session-lineage.json")
CONVERSATIONS_DB = os.path.join(PROJECT_DIR, "memory", "short-term", "conversations.db")
MEMORY_FILE = PROJECT_DIR / "memory" / "MEMORY.md"

def now_beijing():
    return datetime.now(timezone(timedelta(hours=8))).isoformat()

def load_lineage():
    os.makedirs(os.path.dirname(LINEAGE_FILE), exist_ok=True)
    if os.path.exists(LINEAGE_FILE):
        with open(LINEAGE_FILE, "r") as f:
            return json.load(f)
    return {"lineages": {}, "compacts": []}

def save_lineage(data):
    with open(LINEAGE_FILE, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def cmd_track(parent_id, child_id):
    """记录父-子 session 关系"""
    data = load_lineage()
    data["lineages"][child_id] = {
        "parent": parent_id,
        "created_at": now_beijing(),
        "type": "compact"
    }
    # 也记录双向关系
    if parent_id not in data["lineages"]:
        data["lineages"][parent_id] = {}
    data["lineages"][parent_id].setdefault("children", []).append({
        "id": child_id,
        "at": now_beijing()
    })

    save_lineage(data)
    print(f"[OK] 记录血统: {parent_id} → {child_id}")

def cmd_lineage(session_id):
    """查询会话血统链"""
    data = load_lineage()

    # 向上追溯
    chain = [session_id]
    current = session_id
    while current in data["lineages"]:
        parent = data["lineages"][current].get("parent")
        if parent:
            chain.insert(0, parent)
            current = parent
        else:
            break

    print(f"🪜 血统链 (深度 {len(chain)-1}):")
    for i, sid in enumerate(chain):
        prefix = "  ├─ " if i > 0 else "  📌 "
        info = data["lineages"].get(sid, {})
        created = info.get("created_at", "?") if isinstance(info, dict) else "?"
        print(f"{prefix}{sid}")
        if created != "?":
            print(f"    │  创建: {created}")

def cmd_pre_compact(session_id):
    """压缩前：从魂器 conversations.db 提取关键对话到 MEMORY.md"""
    print(f"[PRE-COMPACT] 保护会话 {session_id} 的关键信息...")

    if not os.path.exists(CONVERSATIONS_DB):
        print(f"[WARN] conversations.db 不存在")
        return

    import sqlite3
    key_lines = []
    try:
        with sqlite3.connect(CONVERSATIONS_DB) as conn:
            rows = conn.execute(
                "SELECT role, content FROM conversations WHERE session_id = ? AND role='user' ORDER BY timestamp",
                (session_id,)
            ).fetchall()
            for role, content in rows:
                if content and len(content) > 10:
                    key_lines.append(f"豆豆哥说了: {content[:200]}")
    except Exception as e:
        print(f"[WARN] DB read failed: {e}")

    if key_lines:
        os.makedirs(os.path.dirname(MEMORY_FILE), exist_ok=True)
        with open(MEMORY_FILE, "a", encoding="utf-8") as f:
            f.write(f"\n\n## 压缩保护 ({now_beijing()})\n\n")
            for line in key_lines[-5:]:
                f.write(f"- {line}\n")

        print(f"[OK] 已将 {len(key_lines[-5:])} 条关键对话写入 MEMORY.md")

    # 记录压缩事件
    data = load_lineage()
    data["compacts"].append({
        "session_id": session_id,
        "at": now_beijing(),
        "saved_lines": min(len(key_lines), 5)
    })
    save_lineage(data)

def main():
    if len(sys.argv) < 2:
        print("用法:")
        print("  track <parent_id> <child_id>  — 记录父-子关系")
        print("  lineage <session_id>           — 查询血统链")
        print("  pre-compact <session_id>       — 压缩前保存关键对话")
        return

    cmd = sys.argv[1]
    if cmd == "track" and len(sys.argv) >= 4:
        cmd_track(sys.argv[2], sys.argv[3])
    elif cmd == "lineage" and len(sys.argv) >= 3:
        cmd_lineage(sys.argv[2])
    elif cmd == "pre-compact" and len(sys.argv) >= 3:
        cmd_pre_compact(sys.argv[2])
    else:
        print(f"[FAIL] 未知命令: {cmd}")

if __name__ == "__main__":
    main()
