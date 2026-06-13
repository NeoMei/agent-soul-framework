#!/usr/bin/env python3
"""
Structured Memory Manager — Hermes 风格记忆系统
支持：条目化记忆 + 容量管理 + add/replace/remove + 会话搜索

用法：
  python3 scripts/memory_structured.py add "Agent今天学会了用 curl 拍照"
  python3 scripts/memory_structured.py replace "旧文本片段" "新文本"
  python3 scripts/memory_structured.py remove "要删除的文本片段"
  python3 scripts/memory_structured.py status               # 查看容量
  python3 scripts/memory_structured.py search "关键词"      # FTS5 搜索历史会话
  python3 scripts/memory_structured.py compact              # 压缩合并（LLM辅助）
"""

import json, os, re, sqlite3, sys
import datetime as dt_mod
from datetime import datetime, timezone, timedelta
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
MEMORY_FILE = PROJECT_DIR / "memory" / "MEMORY.md"
MEMORY_DB = PROJECT_DIR / "memory" / "short-term" / "memories.db"
CONVERSATIONS_DB = PROJECT_DIR / "memory" / "short-term" / "conversations.db"

MAX_CHARS = 2200
SECTION_MARKER = "## 用户的记忆 §"
SEPARATOR = "\n\n§§\n\n"

def now_beijing():
    return datetime.now(timezone(timedelta(hours=8)))

def read_memory():
    if not MEMORY_FILE.exists():
        return "# Memory Palace\n"
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        return f.read()

def write_memory(content):
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        f.write(content)

def get_entry_section(text):
    """提取 § 分隔的记忆条目区域"""
    if SECTION_MARKER in text:
        parts = text.split(SECTION_MARKER, 1)
        return parts[0], SECTION_MARKER + parts[1]
    return text, ""

def parse_entries(section):
    """解析结构化的记忆条目"""
    raw = section.split(SECTION_MARKER, 1)[1] if SECTION_MARKER in section else section
    entries = [e.strip() for e in raw.split("§§") if e.strip()]
    return entries

def get_usage():
    """获取容量使用率"""
    content = read_memory()
    prefix, entries_section = get_entry_section(content)
    entry_text = entries_section.replace(SECTION_MARKER, "").strip()
    used = len(entry_text)
    pct = int(used / MAX_CHARS * 100)
    return used, pct

def update_header(content, used, pct):
    """更新容量指示器"""
    header_pattern = re.compile(r"\[(\d+)% — .*?/.*? chars\]")
    new_header = f"[{pct}% — {used}/{MAX_CHARS} chars]"
    if header_pattern.search(content):
        return header_pattern.sub(new_header, content, count=1)
    return content.replace("# Memory Palace\n", f"# Memory Palace\n{new_header}\n", 1)

def cmd_status():
    used, pct = get_usage()
    print(f"📊 记忆容量: [{pct}% — {used}/{MAX_CHARS} chars]")
    content = read_memory()
    prefix, section = get_entry_section(content)
    entries = parse_entries(section)
    for i, e in enumerate(entries, 1):
        print(f"  §{i}: {e[:80]}{'...' if len(e)>80 else ''}")
    if pct > 80:
        print(f"\n⚠️  容量即将用尽，请运行 compact 合并或 remove 清理旧条目。")

def cmd_add(new_entry):
    content = read_memory()
    prefix, section = get_entry_section(content)

    if SECTION_MARKER not in content:
        content += f"\n\n{SECTION_MARKER}\n"
        prefix, section = get_entry_section(content)

    entries = parse_entries(section)

    # 去重
    for e in entries:
        if new_entry in e or e in new_entry:
            print(f"[SKIP] 重复条目: {new_entry[:60]}...")
            return

    ts = now_beijing().strftime("%Y-%m-%d %H:%M")
    entry = f"{ts} | {new_entry}"
    entries.append(entry)

    # 重建 entries section
    new_section = SECTION_MARKER + "\n" + "\n\n§§\n\n".join(entries)
    new_content = prefix.rstrip() + "\n\n" + new_section

    used = len("\n\n".join(entries))
    if used > MAX_CHARS:
        print(f"[WARN] 超出容量上限！({used}/{MAX_CHARS})")
        if len(entries) > 3:
            print(f"[INFO] 已删除最旧条目以腾出空间: {entries[0][:60]}...")
            entries = entries[1:]
        else:
            print(f"[WARN] 条目过少，无法自动清理。请手动 remove 或 compact。")

    new_section = SECTION_MARKER + "\n" + "\n\n§§\n\n".join(entries)
    new_content = prefix.rstrip() + "\n\n" + new_section
    new_content = update_header(new_content, len("\n\n".join(entries)), min(int(len("\n\n".join(entries))/MAX_CHARS*100), 100))

    write_memory(new_content)
    print(f"[OK] 添加记忆: {new_entry[:60]}...")
    cmd_status()

def cmd_replace(old_text, new_text):
    content = read_memory()
    prefix, section = get_entry_section(content)

    if old_text not in section:
        print(f"[FAIL] 未找到要替换的文本: {old_text[:60]}...")
        return

    entries = parse_entries(section)
    replaced = False
    new_entries = []
    for e in entries:
        if old_text in e:
            ts = now_beijing().strftime("%Y-%m-%d %H:%M")
            new_entries.append(f"{ts} | {new_text}")
            replaced = True
            print(f"[OK] 替换: {old_text[:40]}... → {new_text[:40]}...")
        else:
            new_entries.append(e)

    if replaced:
        new_section = SECTION_MARKER + "\n" + "\n\n§§\n\n".join(new_entries)
        new_content = prefix.rstrip() + "\n\n" + new_section
        used = len("\n\n".join(new_entries))
        pct = int(used / MAX_CHARS * 100)
        new_content = update_header(new_content, used, pct)
        write_memory(new_content)
    else:
        print("[FAIL] 未成功替换。")

def cmd_remove(old_text):
    content = read_memory()
    prefix, section = get_entry_section(content)
    entries = parse_entries(section)

    new_entries = [e for e in entries if old_text not in e]
    if len(new_entries) == len(entries):
        print(f"[FAIL] 未找到要删除的条目: {old_text[:60]}...")
        return

    new_section = SECTION_MARKER + "\n" + "\n\n§§\n\n".join(new_entries)
    new_content = prefix.rstrip() + "\n\n" + new_section
    used = len("\n\n".join(new_entries))
    pct = int(used / MAX_CHARS * 100)
    new_content = update_header(new_content, used, pct)
    write_memory(new_content)
    print(f"[OK] 已删除条目: {old_text[:60]}...")
    cmd_status()

def cmd_compact():
    """使用 LLM 压缩合并记忆（保留核心信息）"""
    content = read_memory()
    prefix, section = get_entry_section(content)
    entries = parse_entries(section)

    if len(entries) < 3:
        print("[INFO] 条目不足，无需压缩。")
        return

    prompt = f"""你是一个记忆压缩器。请将下面的记忆条目合并，去掉冗余、保留核心信息。

规则：
1. 保留每个条目的核心事实（名字、数值、事件、偏好）
2. 合并相似主题的条目
3. 删除过时的、被后续信息覆盖的条目
4. 输出格式：每条一行，以"日期 | 内容"格式
5. 只输出合并后的条目，不要解释

当前条目（{len(entries)}条）：
{"\n".join(f"- {e}" for e in entries)}

请输出合并后的条目（每行一个）："""

    try:
        import subprocess
        result = subprocess.run(
            ["opencode", "run", "--print-logs", "--log-level", "ERROR"],
            input=prompt, capture_output=True, text=True, timeout=120, cwd=str(PROJECT_DIR)
        )
        if result.returncode == 0 and result.stdout.strip():
            text = result.stdout.strip()
            new_entries = [line.strip() for line in text.splitlines() if line.strip() and "|" in line]
            if new_entries:
                new_section = SECTION_MARKER + "\n" + "\n\n§§\n\n".join(new_entries)
                new_content = prefix.rstrip() + "\n\n" + new_section
                used = len("\n\n".join(new_entries))
                pct = int(used / MAX_CHARS * 100)
                new_content = update_header(new_content, used, pct)
                write_memory(new_content)
                print(f"[OK] 压缩完成: {len(entries)}条 → {len(new_entries)}条")
                cmd_status()
                return
            else:
                print("[FAIL] LLM 返回格式无效。")
        else:
            print(f"[FAIL] opencode run failed: {result.stderr[:200]}")
    except Exception as e:
        print(f"[FAIL] 压缩出错: {e}")


# ── 会话搜索（FTS5）──────────────────────────────

def init_session_search():
    """初始化会话 FTS5 索引"""
    conn = sqlite3.connect(str(MEMORY_DB))
    conn.execute("""CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        date TEXT,
        path TEXT,
        summary TEXT,
        content TEXT,
        participant TEXT,
        indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""")
    # 添加缺失的列（兼容旧表）
    for col in ["content", "participant"]:
        try:
            conn.execute(f"ALTER TABLE sessions ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError as e:
            if "duplicate column" not in str(e).lower():
                print(f"[WARN] ALTER TABLE failed for column {col}: {e}")
    conn.execute("""CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
        id, date, path, summary, content, participant, content='sessions', content_rowid='rowid'
    )""")
    # 创建触发器保持 FTS 同步
    conn.executescript("""
        CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
            INSERT INTO sessions_fts(rowid, id, date, path, summary, content, participant)
            VALUES (new.rowid, new.id, new.date, new.path, new.summary, new.content, new.participant);
        END;
        CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
            INSERT INTO sessions_fts(sessions_fts, rowid, id, date, path, summary, content, participant)
            VALUES ('delete', old.rowid, old.id, old.date, old.path, old.summary, old.content, old.participant);
        END;
        CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
            INSERT INTO sessions_fts(sessions_fts, rowid, id, date, path, summary, content, participant)
            VALUES ('delete', old.rowid, old.id, old.date, old.path, old.summary, old.content, old.participant);
            INSERT INTO sessions_fts(rowid, id, date, path, summary, content, participant)
            VALUES (new.rowid, new.id, new.date, new.path, new.summary, new.content, new.participant);
        END;
    """)
    conn.commit()
    return conn

def cmd_search(query, limit=10, show_content=False):
    """FTS5 搜索历史会话"""
    conn = init_session_search()
    try:
        # FTS5 前缀搜索：用 * 通配符
        search_query = " OR ".join(f'"{token}"*' for token in query.split())
        try:
            rows = conn.execute(
                "SELECT id, date, path, summary, content, participant, rank FROM sessions_fts WHERE sessions_fts MATCH ? ORDER BY rank LIMIT ?",
                (search_query, limit)
            ).fetchall()
        except sqlite3.OperationalError:
            # FTS5 查询语法错误时回退到简单 LIKE
            rows = []

        if not rows:
            # 回退：LIKE 搜索
            like_pattern = f"%{query}%"
            rows_raw = conn.execute(
                "SELECT id, date, path, summary, content, participant FROM sessions WHERE content LIKE ? OR summary LIKE ? LIMIT ?",
                (like_pattern, like_pattern, limit)
            ).fetchall()
            if rows_raw:
                print(f"🔍 '{query}' 模糊匹配 {len(rows_raw)} 个会话:\n")
                for row in rows_raw:
                    sess_id, date, path, summary, content, participant = row
                    print(f"  [{date or '?'}] {sess_id[:16]}...")
                    print(f"  参与者: {participant or 'unknown'}")
                    print(f"  摘要: {summary[:120] if summary else '(无摘要)'}")
                    if show_content:
                        for line in (content or "").split("\n")[:5]:
                            print(f"    {line[:150]}")
                    print(f"  路径: {path}")
                    print()
                return

            print(f"[INFO] 未找到匹配 '{query}' 的会话。")
            return

        print(f"🔍 '{query}' 匹配 {len(rows)} 个会话:\n")
        for row in rows:
            sess_id, date, path, summary, content, participant, rank = row
            print(f"  [{date or '?'}] {sess_id[:16]}... (rank={rank})")
            print(f"  参与者: {participant or 'unknown'}")
            print(f"  摘要: {summary[:120] if summary else '(无摘要)'}")
            if show_content:
                for line in (content or "").split("\n")[:5]:
                    print(f"    {line[:150]}")
            print(f"  路径: {path}")
            print()
    finally:
        conn.close()

def cmd_index_sessions(limit=50, force=False):
    """索引最近会话到 FTS5 — 从魂器自身的 conversations.db 读取"""
    conn = init_session_search()

    # 从魂器自己的 conversations.db 读取对话并索引
    if not CONVERSATIONS_DB.exists():
        print(f"[INFO] conversations.db 不存在，请先运行 memory_manager.py sync")
        conn.close()
        return

    indexed = 0
    try:
        with sqlite3.connect(str(CONVERSATIONS_DB)) as src_conn:
            # 获取所有 session
            sessions = src_conn.execute(
                "SELECT session_id, MAX(timestamp) as last_ts FROM conversations GROUP BY session_id ORDER BY last_ts DESC LIMIT ?",
                (limit,)
            ).fetchall()

            for (sess_id, last_ts) in sessions:
                # 检查是否已索引
                exists = conn.execute("SELECT COUNT(*) FROM sessions WHERE id=?", (sess_id,)).fetchone()[0]
                if exists and not force:
                    continue

                # 获取该 session 的所有对话
                rows = src_conn.execute(
                    "SELECT role, content, timestamp FROM conversations WHERE session_id=? ORDER BY timestamp",
                    (sess_id,)
                ).fetchall()

                (first_ts,) = src_conn.execute(
                    "SELECT MIN(timestamp) FROM conversations WHERE session_id=?", (sess_id,)
                ).fetchone()
                date_str = dt_mod.datetime.fromtimestamp(first_ts).strftime("%Y-%m-%d %H:%M") if first_ts else "unknown"

                messages = []
                participants = set()
                for role, content, ts in rows:
                    if role in ("user", "assistant"):
                        label = "👤" if role == "user" else "🤖"
                        messages.append(f"{label} {content[:200]}")
                        if role == "user":
                            participants.add("user")

                summary = " | ".join(messages[:3])[:300] if messages else "(空会话)"
                content = "\n".join(messages)[:50000]
                participant = ", ".join(participants) if participants else "unknown"

                if exists:
                    conn.execute(
                        "UPDATE sessions SET date=?, summary=?, content=?, participant=? WHERE id=?",
                        (date_str, summary, content, participant, sess_id)
                    )
                else:
                    conn.execute(
                        "INSERT INTO sessions (id, date, path, summary, content, participant) VALUES (?, ?, ?, ?, ?, ?)",
                        (sess_id, date_str, str(CONVERSATIONS_DB), summary, content, participant)
                    )
                indexed += 1

    except Exception as e:
        print(f"[WARN] 索引失败: {e}")
    finally:
        conn.commit()
        conn.close()
    print(f"[OK] 索引了 {indexed} 个会话。")

# ── 主入口 ────────────────────────────────────────

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    args = sys.argv[2:]

    if cmd == "status":
        cmd_status()
    elif cmd == "add":
        cmd_add(" ".join(args) if args else "")
    elif cmd == "replace":
        cmd_replace(args[0] if len(args) > 0 else "",
                     args[1] if len(args) > 1 else "")
    elif cmd == "remove":
        cmd_remove(" ".join(args) if args else "")
    elif cmd == "compact":
        cmd_compact()
    elif cmd == "search":
        show_content = "--content" in args or "-c" in args
        query = " ".join(a for a in args if a not in ("--content", "-c"))
        cmd_search(query, show_content=show_content)
    elif cmd == "index":
        force = "--force" in args or "-f" in args
        limit = 50
        for i, a in enumerate(args):
            if a.startswith("--limit="):
                limit = int(a.split("=")[1])
            elif a == "--limit" and i + 1 < len(args):
                limit = int(args[i + 1])
        cmd_index_sessions(limit=limit, force=force)
    else:
        print("用法: python3 scripts/memory_structured.py <command> [args]")
        print("  status                     — 查看记忆容量和使用率")
        print("  add \"内容\"                 — 添加记忆条目")
        print("  replace \"旧文本\" \"新文本\"  — 替换记忆条目（子串匹配）")
        print("  remove \"文本\"              — 删除记忆条目（子串匹配）")
        print("  compact                    — LLM 压缩合并记忆")
        print("  search \"关键词\" [--content] — FTS5 搜索历史会话（-c 显示内容片段）")
        print("  index [--force] [--limit=N] — 索引最近会话到 FTS5")

if __name__ == "__main__":
    main()
