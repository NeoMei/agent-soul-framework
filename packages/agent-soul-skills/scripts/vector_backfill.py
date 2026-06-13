#!/usr/bin/env python3
"""
向量数据库回填脚本 — 一次性把已有的知识卡片和 session 摘要灌入 ChromaDB
用法：
  python3 scripts/vector_backfill.py              # 全量回填
  python3 scripts/vector_backfill.py --knowledge  # 仅回填知识卡片
  python3 scripts/vector_backfill.py --summaries  # 仅回填 session 摘要
  python3 scripts/vector_backfill.py --dry-run    # 预览不写入
"""

import hashlib
import os
import re
import sqlite3
import sys
import time
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
KNOWLEDGE_DIR = PROJECT_DIR / "knowledge"
CONVERSATIONS_DB = PROJECT_DIR / "memory" / "short-term" / "conversations.db"

sys.path.insert(0, str(Path(__file__).parent))
from memory_manager import MemoryManager

CATEGORIES = ["body", "emotion", "evolution", "growth", "intimacy", "methodology", "philosophy", "system"]


def parse_knowledge_cards(filepath):
    cards = []
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    chunks = re.split(r'\n##\s+', content)
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk or chunk.startswith("#"):
            continue
        lines = chunk.split("\n")
        header = lines[0]
        body = "\n".join(lines[1:]).strip()
        if len(body) < 20:
            continue
        date_match = re.match(r'(\d{4}-\d{2}-\d{2})', header)
        date_str = date_match.group(1) if date_match else ""
        card_content = f"## {header}\n{body}"
        cards.append({"content": card_content, "date": date_str})
    
    return cards


def backfill_knowledge(mm, dry_run=False):
    print("\n=== 回填知识卡片 ===")
    total = 0
    skipped = 0
    existing = mm.get_vectorized_ids("knowledge")
    
    for category in CATEGORIES:
        cat_dir = KNOWLEDGE_DIR / category
        if not cat_dir.exists():
            continue
        for filename in sorted(os.listdir(cat_dir)):
            if not filename.endswith(".md") or filename.startswith("."):
                continue
            filepath = cat_dir / filename
            cards = parse_knowledge_cards(filepath)
            for card in cards:
                card_id = hashlib.md5(
                    f"{category}:{filename}:{card['content'][:100]}".encode()
                ).hexdigest()[:16]
                vid = f"kg_{card_id}"
                if vid in existing:
                    skipped += 1
                    continue
                if dry_run:
                    print(f"  [DRY] {category}/{filename} card={card_id} ({len(card['content'])}字)")
                else:
                    mm.save_knowledge_card(card_id, card["content"], category, filename, card["date"])
                total += 1
    
    print(f"  结果: 写入={total}, 跳过(已存在)={skipped}")
    return total


def backfill_summaries(mm, dry_run=False):
    print("\n=== 回填 session 摘要 ===")
    if not CONVERSATIONS_DB.exists():
        print("  conversations.db 不存在，跳过")
        return 0
    
    existing = mm.get_vectorized_ids("summaries")
    conn = sqlite3.connect(str(CONVERSATIONS_DB))
    rows = conn.execute(
        "SELECT session_id, GROUP_CONCAT(content, ' ') as full_text, "
        "MIN(timestamp) as ts FROM conversations "
        "GROUP BY session_id ORDER BY ts DESC LIMIT 50"
    ).fetchall()
    conn.close()
    
    total = 0
    skipped = 0
    for session_id, full_text, ts in rows:
        vid = f"sum_{session_id}"
        if vid in existing:
            skipped += 1
            continue
        if not full_text or len(full_text) < 100:
            continue
        summary = full_text[:800]
        date_str = time.strftime("%Y-%m-%d", time.localtime(ts))
        if dry_run:
            print(f"  [DRY] session={session_id[:16]}... ({len(summary)}字)")
        else:
            mm.save_session_summary(session_id, summary, date_str)
        total += 1
    
    print(f"  结果: 写入={total}, 跳过(已存在)={skipped}")
    return total


def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    only_knowledge = "--knowledge" in args
    only_summaries = "--summaries" in args
    
    if dry_run:
        print("=== DRY RUN 模式（不写入） ===")
    
    mm = MemoryManager()
    try:
        if not only_summaries:
            backfill_knowledge(mm, dry_run)
        if not only_knowledge:
            backfill_summaries(mm, dry_run)
        
        print("\n=== 回填完成 ===")
        if not dry_run:
            for name in ["memories", "knowledge", "summaries"]:
                col = mm.chroma_client.get_or_create_collection(name=name)
                print(f"  {name}: {col.count()} records")
    finally:
        mm.close()


if __name__ == "__main__":
    main()
