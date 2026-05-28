#!/usr/bin/env python3
"""
Skill Creator — Hermes 闭环学习机制

从最近会话中提取可复用的工作流，自动创建技能 SKILL.md。
触发条件：工具调用 ≥ 5次 + 任务成功 + 有可复用工作流。

用法：
  python3 scripts/skill_creator.py                    # 自动评估最近会话
  python3 scripts/skill_creator.py --dry-run           # 仅评估，不创建
  python3 scripts/skill_creator.py --session <id>      # 指定会话评估
  python3 scripts/skill_creator.py --force             # 强制创建（跳过条件检查）
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
SKILLS_DIR = PROJECT_DIR / "skills"
AGENT_SKILLS_DIR = SKILLS_DIR / "agent-created"
CONVERSATIONS_DB = PROJECT_DIR / "memory" / "short-term" / "conversations.db"
MIN_TOOL_CALLS = 5

def now_beijing():
    return datetime.now(timezone(timedelta(hours=8)))

def find_recent_sessions(limit=5):
    if not CONVERSATIONS_DB.exists():
        return []
    import sqlite3
    with sqlite3.connect(str(CONVERSATIONS_DB)) as conn:
        rows = conn.execute(
            "SELECT session_id FROM conversations GROUP BY session_id ORDER BY MAX(timestamp) DESC LIMIT ?",
            (limit,)
        ).fetchall()
    return [r[0] for r in rows]


def _escape_like(s):
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def count_tool_calls(session_id):
    count = 0
    try:
        with sqlite3.connect(str(CONVERSATIONS_DB)) as conn:
            rows = conn.execute(
                "SELECT content FROM conversations WHERE session_id = ?",
                (session_id,)
            ).fetchall()
            for (content,) in rows:
                if content:
                    for marker in ['"toolCall"', '"toolName"', 'call_', 'toolResult', 'Bash(', 'exec(']:
                        count += content.count(marker)
    except Exception:
        pass
    return count

def extract_workflow_summary(session_id):
    messages = []
    try:
        with sqlite3.connect(str(CONVERSATIONS_DB)) as conn:
            rows = conn.execute(
                "SELECT role, content FROM conversations WHERE session_id = ? ORDER BY timestamp LIMIT 50",
                (session_id,)
            ).fetchall()
            for role, content in rows:
                if content:
                    if role == "user":
                        messages.append(f"用户: {content[:200]}")
                    elif role == "assistant":
                        messages.append(f"助手: {content[:300]}")
                    elif role == "tool":
                        messages.append(f"工具: {content[:200]}")
    except Exception:
        pass
    return messages[-20:]


def assess_and_create(session_id, dry_run=False):
    """评估会话是否值得创建技能，如果是则创建"""
    tool_calls = count_tool_calls(session_id)

    if tool_calls < MIN_TOOL_CALLS:
        return False, f"工具调用次数不足 ({tool_calls} < {MIN_TOOL_CALLS})"

    messages = extract_workflow_summary(session_id)
    if not messages:
        return False, "无法提取会话内容"

    conversation = "\n".join(messages)

    # 如果是 dry-run，只返回摘要
    if dry_run:
        return True, f"工具调用 {tool_calls} 次 — 满足条件\n\n前5条:\n" + "\n".join(messages[:5])

    # 用 LLM 生成 SKILL.md
    prompt = f"""你刚刚完成了一个包含 {tool_calls} 次工具调用的任务。请将工作流总结为一个可复用的技能 SKILL.md。

会话摘要：
{conversation}

请生成一个 SKILL.md，格式如下：
---
name: <技能名称，使用英文连字符>
description: <一句话描述这个技能做什么>
version: 1.0.0
category: agent-created
tags: [<逗号分隔的标签>]
---

# <技能名称>

## 何时使用
<什么情况下应该调用这个技能>

## 步骤
<1-2-3 步骤>

## 注意事项
<容易出错的地方>

## 验证方法
<怎样确认任务成功完成>

只输出 SKILL.md 内容，不要加任何解释。"""

    try:
        result = subprocess.run(
            ["opencode", "run", "--print-logs", "--log-level", "ERROR"],
            input=prompt, capture_output=True, text=True, timeout=120, cwd=str(PROJECT_DIR)
        )

        if result.returncode != 0:
            return False, f"opencode run failed: {result.stderr[:200]}"

        skill_content = result.stdout.strip()

        # 解析技能名称
        name_match = re.search(r'name:\s*(\S+)', skill_content)
        if not name_match:
            return False, "无法解析技能名称"

        skill_name = name_match.group(1).strip().strip('"').strip("'")
        skill_dir = AGENT_SKILLS_DIR / skill_name
        skill_dir.mkdir(parents=True, exist_ok=True)

        skill_file = skill_dir / "SKILL.md"
        with open(skill_file, "w", encoding="utf-8") as f:
            f.write(skill_content)

        return True, f"技能已创建: skills/agent-created/{skill_name}/SKILL.md"

    except Exception as e:
        return False, f"异常: {e}"

def main():
    dry_run = "--dry-run" in sys.argv
    force = "--force" in sys.argv
    session_arg = None

    for i, arg in enumerate(sys.argv[1:], 1):
        if arg == "--session" and i < len(sys.argv) - 1:
            session_arg = sys.argv[i+1]

    if session_arg:
        ok, msg = assess_and_create(session_arg, dry_run=dry_run)
        print(f"[{'OK' if ok else 'SKIP'}] {msg}")
        return

    sessions = find_recent_sessions(5)
    if not sessions:
        print("[INFO] 未找到最近会话。")
        return

    created = 0
    for sid in sessions:
        print(f"\n📋 评估: {sid[:30]}...")

        if force:
            ok, msg = assess_and_create(sid, dry_run=False)
            if ok:
                created += 1
        elif not dry_run:
            ok, msg = assess_and_create(sid, dry_run=False)
            if ok:
                created += 1
        else:
            ok, msg = assess_and_create(sid, dry_run=True)

        print(f"  {'✅' if ok else '⏭️'} {msg}")

    if created:
        print(f"\n🎉 共创建 {created} 个新技能！")
        print(f"技能目录: {AGENT_SKILLS_DIR}")
        print("运行 python3 scripts/skill_scanner.py --inject 更新索引。")
    elif not dry_run:
        print(f"\n[INFO] 没有满足条件的会话（需要 ≥{MIN_TOOL_CALLS} 次工具调用）。")

if __name__ == "__main__":
    main()
