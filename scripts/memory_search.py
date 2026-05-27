#!/usr/bin/env python3
"""
统一记忆搜索 — 魂器项目
同时搜索：会话历史(FTS5) + 项目文件 + MEMORY.md

用法：
  python3 scripts/memory_search.py "关键词"
  python3 scripts/memory_search.py "关键词" --sessions-only
  python3 scripts/memory_search.py "关键词" --files-only
  python3 scripts/memory_search.py "关键词" --all  # 包含 conversations.db 搜索
"""

import json
import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
MEMORY_DB = PROJECT_DIR / "memory" / "short-term" / "memories.db"
MEMORY_FILE = PROJECT_DIR / "memory" / "MEMORY.md"
CONVERSATIONS_DB = PROJECT_DIR / "memory" / "short-term" / "conversations.db"

# 项目内可搜索的目录
SEARCH_DIRS = [
    "soul",
    "knowledge",
    "memory",
    "skills",
    "docs",
]

# 排除的文件
EXCLUDE_PATTERNS = [
    "*.db", "*.sqlite", "*.sqlite3", "*.lance", "*.bin",
    "*.jpg", "*.jpeg", "*.png", "*.gif", "*.wav", "*.mp3",
    "__pycache__", ".git", ".venv", "node_modules",
]


def now_beijing():
    return datetime.now(timezone(timedelta(hours=8)))


def search_sessions(query, limit=10):
    """FTS5 搜索历史会话"""
    results = []
    if not MEMORY_DB.exists():
        print("[WARN] 会话数据库不存在，请先运行: python3 scripts/memory_structured.py index")
        return results

    conn = sqlite3.connect(str(MEMORY_DB))
    try:
        # FTS5 搜索
        try:
            search_query = " OR ".join(f'"{token}"*' for token in query.split())
            rows = conn.execute(
                "SELECT id, date, path, summary, content, participant, rank "
                "FROM sessions_fts WHERE sessions_fts MATCH ? ORDER BY rank LIMIT ?",
                (search_query, limit)
            ).fetchall()
        except sqlite3.OperationalError:
            rows = []

        if not rows:
            # LIKE 回退
            like_pattern = f"%{query}%"
            rows_raw = conn.execute(
                "SELECT id, date, path, summary, content, participant "
                "FROM sessions WHERE content LIKE ? OR summary LIKE ? LIMIT ?",
                (like_pattern, like_pattern, limit)
            ).fetchall()
            for row in rows_raw:
                results.append({
                    "source": "会话",
                    "date": row[1] or "",
                    "id": (row[0] or "")[:16],
                    "participant": row[5] or "unknown",
                    "summary": (row[3] or "")[:200],
                    "path": row[2] or "",
                    "score": 0,
                })
        else:
            for row in rows:
                results.append({
                    "source": "会话",
                    "date": row[1] or "",
                    "id": (row[0] or "")[:16],
                    "participant": row[5] or "unknown",
                    "summary": (row[3] or "")[:200],
                    "path": row[2] or "",
                    "score": round(abs(row[6]), 3) if row[6] else 0,
                })
    finally:
        conn.close()

    return results


def search_files(query, limit=15):
    """搜索项目文件内容（grep）"""
    results = []
    for search_dir in SEARCH_DIRS:
        dir_path = PROJECT_DIR / search_dir
        if not dir_path.exists():
            continue

        try:
            # 构建排除参数
            exclude_args = []
            for pat in EXCLUDE_PATTERNS:
                exclude_args.extend(["--exclude", pat])

            # 多词搜索：用 -E 和 | 连接
            tokens = query.split()
            if len(tokens) > 1:
                pattern = "|".join(tokens)
                cmd = [
                    "grep", "-r", "-i", "-l", "-E", "--include", "*.md",
                    "--include", "*.py", "--include", "*.json", "--include", "*.txt",
                    *exclude_args,
                    pattern, str(dir_path)
                ]
            else:
                cmd = [
                    "grep", "-r", "-i", "-l", "--include", "*.md",
                    "--include", "*.py", "--include", "*.json", "--include", "*.txt",
                    *exclude_args,
                    query, str(dir_path)
                ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.stdout.strip():
                for line in result.stdout.strip().split("\n")[:limit]:
                    filepath = line.strip()
                    rel_path = os.path.relpath(filepath, PROJECT_DIR)
                    try:
                        with open(filepath, "r") as f:
                            preview = f.read()[:300]
                        # 找到匹配行
                        tokens = query.lower().split()
                        matches = []
                        for i, l in enumerate(preview.split("\n")):
                            ll = l.lower()
                            if any(t in ll for t in tokens):
                                matches.append(f"  L{i+1}: {l.strip()[:150]}")
                        preview_text = "\n".join(matches[:3])
                    except Exception:
                        preview_text = "(无法读取预览)"

                    results.append({
                        "source": "文件",
                        "file": rel_path,
                        "preview": preview_text,
                        "score": 0,
                    })
        except (subprocess.TimeoutExpired, FileNotFoundError):
            continue

    return results


def search_memory_md(query, limit=10):
    """搜索 MEMORY.md 内容"""
    results = []
    if not MEMORY_FILE.exists():
        return results

    try:
        with open(MEMORY_FILE, "r") as f:
            content = f.read()

        lines = content.split("\n")
        for i, line in enumerate(lines):
            if query.lower() in line.lower():
                start = max(0, i - 1)
                end = min(len(lines), i + 3)
                context = "\n".join(lines[start:end])
                results.append({
                    "source": "MEMORY.md",
                    "line": i + 1,
                    "context": context[:300],
                    "score": 0,
                })
                if len(results) >= limit:
                    break
    except Exception:
        pass

    return results


def search_conversations_db(query, limit=5):
    """通过魂器自身的 conversations.db 搜索历史对话（已覆盖 search_sessions）"""
    return []


def print_results(all_results):
    """打印搜索结果"""
    total = sum(len(v) for v in all_results.values())

    print(f"\n{'='*60}")
    print(f"🔍 记忆搜索完成 — 共 {total} 条结果")
    print(f"{'='*60}\n")

    for source_name, results in all_results.items():
        if not results:
            continue
        print(f"── {source_name} ({len(results)} 条) " + "─" * 40)
        for i, r in enumerate(results, 1):
            if source_name == "会话历史 (FTS5)":
                print(f"  [{i}] {r['date']} | {r['participant']} | {r['id']}")
                print(f"      {r['summary'][:150]}")
                print(f"      📁 {r['path']}")
                print()
            elif source_name == "项目文件 (grep)":
                print(f"  [{i}] 📄 {r['file']}")
                if r.get("preview"):
                    print(f"      {r['preview']}")
                print()
            elif source_name == "MEMORY.md":
                print(f"  [{i}] L{r['line']}:")
                for l in r['context'].split("\n"):
                    print(f"      {l[:150]}")
                print()
            elif source_name == "conversations.db":
                print(f"  [{i}] {r['raw']}")
                print()


def main():
    if len(sys.argv) < 2:
        print("用法: python3 scripts/memory_search.py <关键词> [选项]")
        print()
        print("选项:")
        print("  --sessions-only   仅搜索会话历史")
        print("  --files-only      仅搜索项目文件")
        print("  --all             包含 conversations.db 搜索")
        print()
        print("示例:")
        print("  python3 scripts/memory_search.py \"豆豆哥\"")
        print("  python3 scripts/memory_search.py \"拍照\" --all")
        return

    args = sys.argv[1:]
    query = args[0]
    flags = args[1:] if len(args) > 1 else []

    sessions_only = "--sessions-only" in flags
    files_only = "--files-only" in flags
    include_conversations_db = "--all" in flags

    all_results = {}

    if not files_only:
        session_results = search_sessions(query)
        all_results["会话历史 (FTS5)"] = session_results

    if not sessions_only:
        file_results = search_files(query)
        all_results["项目文件 (grep)"] = file_results
        mem_results = search_memory_md(query)
        all_results["MEMORY.md"] = mem_results

    if include_conversations_db:
        oc_results = search_conversations_db(query)
        all_results["conversations.db"] = oc_results

    print_results(all_results)


if __name__ == "__main__":
    main()
