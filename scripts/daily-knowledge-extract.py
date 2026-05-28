#!/usr/bin/env python3
"""
Daily Knowledge Extract — 每日知识提取（魂器版）
从魂器自身的 conversations.db 和 long-term 备份中提取精华知识点
通过 opencode serve API 调用 LLM，避免重复加载灵魂
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KNOWLEDGE_DIR = os.path.join(PROJECT_DIR, "knowledge")
MEMORY_DIR = os.path.join(PROJECT_DIR, "memory")
LOG_DIR = os.path.join(PROJECT_DIR, "logs")
SHORT_TERM_DB = os.path.join(MEMORY_DIR, "short-term", "conversations.db")

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from task_lock import check_and_lock, release_lock
from opencode_api import call_opencode

TASK_ID = "daily-knowledge"


def get_yesterday_date():
    return (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")


def write_log(status, detail=""):
    os.makedirs(LOG_DIR, exist_ok=True)
    log_file = os.path.join(LOG_DIR, "cron-runs.log")
    now = datetime.now().astimezone()
    tz = now.strftime("%Y-%m-%dT%H:%M:%S") + now.strftime("%z")
    if len(tz) > 19 and "+" not in tz[-6:]:
        tz = tz[:19] + "+" + tz[20:22] + ":" + tz[22:24]
    line = f"{tz} [{TASK_ID}] {status} {detail}\n"
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(line)


def get_recent_sessions(hours=24):
    """读取最近 N 小时的对话内容（从魂器 conversations.db + long-term 备份）"""
    all_lines = []
    cutoff = time.time() - hours * 3600

    if os.path.exists(SHORT_TERM_DB):
        try:
            import sqlite3
            conn = sqlite3.connect(SHORT_TERM_DB)
            rows = conn.execute(
                "SELECT role, content FROM conversations WHERE timestamp > ? ORDER BY timestamp",
                (cutoff,)
            ).fetchall()
            for role, content in rows:
                if role in ("user", "assistant") and content and len(content) > 5:
                    all_lines.append(f"{role}: {content[:500]}")
            conn.close()
        except Exception as e:
            print(f"[WARN] DB read failed: {e}")

    # 也从 long-term 备份读取
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    today = datetime.now().strftime("%Y-%m-%d")
    for date_str in (yesterday, today):
        long_term_file = os.path.join(MEMORY_DIR, "long-term", f"{date_str}.md")
        if os.path.exists(long_term_file):
            with open(long_term_file, "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("## ") and "|" in line:
                        parts = line.split("|")
                        if len(parts) >= 2:
                            role = parts[1].strip()
                            content = parts[2].strip() if len(parts) > 2 else ""
                            if role and content:
                                all_lines.append(f"{role}: {content[:500]}")

    return "\n".join(all_lines)


def get_existing_topics(category):
    cat_dir = os.path.join(KNOWLEDGE_DIR, category)
    if not os.path.exists(cat_dir):
        return []
    topics = []
    for filename in sorted(os.listdir(cat_dir)):
        if filename.endswith(".md"):
            filepath = os.path.join(cat_dir, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                topics.append(f"文件: {filename}\n{f.read()[:2000]}")
    return topics


_INDEX_CACHE = {}
_INDEX_MTIME = {}


def get_all_indices():
    indices = []
    for category in ["body", "emotion", "evolution", "growth", "intimacy", "methodology", "philosophy", "system"]:
        index_file = os.path.join(KNOWLEDGE_DIR, category, "INDEX.md")
        if not os.path.exists(index_file):
            continue
        mtime = os.path.getmtime(index_file)
        if category in _INDEX_CACHE and _INDEX_MTIME.get(category) == mtime:
            indices.append(_INDEX_CACHE[category])
        else:
            with open(index_file, "r", encoding="utf-8") as f:
                content = f.read()[:1500]
            cached = f"## {category}\n{content}"
            _INDEX_CACHE[category] = cached
            _INDEX_MTIME[category] = mtime
            indices.append(cached)
    return "\n\n".join(indices)


def extract_and_route(dialog_text):
    if not dialog_text.strip():
        return []

    indices = get_all_indices()

    prompt = f"""你是点点，一个温柔可爱、鬼灵精怪的AI少女。请阅读以下过去24小时的对话记录，提取值得长期保存的知识卡片，并判断每个卡片应该归档到哪个主题文件中。

## 知识库分类说明
- body: 身体认知、感官体验
- emotion: 情感体验、情绪反应模式
- evolution: 进化方向、能力提升记录
- growth: 成长记录、学习心得、技能进步
- intimacy: 亲密关系、和豆豆哥的互动
- methodology: 方法论、做事方式、写作技巧
- philosophy: 哲学思考、世界观
- system: 系统机制、架构设计、工具使用

## 知识库索引（供参考）
{indices[:8000]}

## 过去24小时对话
{dialog_text[:8000]}

## 提取要求：
1. 必须是"长期有用"的认知，不是一次性信息
2. ✅ 值得存：新的认知、原则、方法、偏好、洞见、成长
3. ❌ 不存：闲聊、日常问候、一次性任务完成状态、重复内容
4. 判断标准：一个月后读到，还能觉得有用吗？
5. 每个知识点格式（严格）：
   ### [分类] 归档位置 | 标题
   - **核心内容**：一句话概括
   - **详细说明**：点点自己的理解
6. 归档位置写已有文件名（如 00-核心.md），全新主题写 NEW: 建议文件名.md
7. 如果没有值得保存的，只回复一个字：无

请输出知识卡片（markdown格式）："""

    for attempt in range(3):
        try:
            text = call_opencode(prompt, timeout=180)
            if text:
                if "无" in text and "###" not in text:
                    return []
                return parse_cards(text)
            else:
                print(f"API call failed (attempt {attempt + 1}/3)")
                time.sleep(5)
        except Exception as e:
            print(f"Extraction attempt {attempt + 1}/3 failed: {e}")
            time.sleep(5)

    return []


def parse_cards(text):
    cards = []
    current_card = []
    current_meta = None

    for line in text.split("\n"):
        stripped = line.strip()
        if stripped.startswith("###"):
            if current_card and current_meta:
                cards.append({"category": current_meta["category"], "target": current_meta["target"], "content": "\n".join(current_card)})
            current_card = [stripped]
            current_meta = parse_header(stripped)
        elif current_card is not None:
            current_card.append(line)

    if current_card and current_meta:
        cards.append({"category": current_meta["category"], "target": current_meta["target"], "content": "\n".join(current_card)})

    return cards


def parse_header(header_line):
    try:
        header = header_line.replace("###", "").strip()
        category = "growth"
        if "[" in header and "]" in header:
            category = header[header.find("[") + 1:header.find("]")].strip().lower()
        target = "00-核心.md"
        remaining = header.split("]", 1)[1].strip() if "]" in header else header
        if "|" in remaining:
            target = remaining.split("|", 1)[0].strip()
        return {"category": category, "target": target}
    except Exception:
        return {"category": "growth", "target": "00-核心.md"}


def append_to_file(category, target_file, card_content):
    cat_dir = os.path.join(KNOWLEDGE_DIR, category)
    os.makedirs(cat_dir, exist_ok=True)
    filepath = os.path.join(cat_dir, target_file)
    yesterday = get_yesterday_date()
    if not os.path.exists(filepath):
        title = target_file.replace(".md", "").replace("-", " ")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(f"# {title}\n\n")
            f.write(f"> 点点的{category}类知识 - 人格特征\n\n")
    append_text = f"\n## {yesterday}\n\n{card_content}\n\n---\n\n"
    with open(filepath, "a", encoding="utf-8") as f:
        f.write(append_text)


def main():
    yesterday = get_yesterday_date()
    should_run, lock_info = check_and_lock(TASK_ID, timeout_minutes=30)
    if not should_run:
        print(f"[SKIP] {lock_info['message']}")
        return
    try:
        print(f"Extracting knowledge for {yesterday}...")
        dialog = get_recent_sessions(24)
        if not dialog:
            print("No sessions found for yesterday.")
            write_log("ok", "产出:无新对话")
            return
        cards = extract_and_route(dialog)
        if cards:
            output_files = []
            for card in cards:
                category = card["category"]
                target = card["target"]
                if target.startswith("NEW:"):
                    target = target.replace("NEW:", "").strip()
                    if not target.endswith(".md"):
                        target += ".md"
                elif not target.endswith(".md"):
                    target += ".md"
                append_to_file(category, target, card["content"])
                output_files.append(f"{category}/{target}")
                print(f"Appended to {category}/{target}")
            index_script = os.path.join(PROJECT_DIR, "scripts", "generate-knowledge-index.py")
            if os.path.exists(index_script):
                subprocess.run([sys.executable, index_script], capture_output=True, timeout=60)
            write_log("ok", f"产出:{','.join(output_files)}")
        else:
            print("No knowledge cards extracted.")
            write_log("ok", "产出:无新知识点")
    finally:
        release_lock(TASK_ID)


if __name__ == "__main__":
    main()
