#!/usr/bin/env python3
"""
Monthly Knowledge Review — 月底知识大审查（魂器版）
跨分类深度审查：发现知识关联、识别盲区、清理冗余、评估成长轨迹。

对全部知识分类进行跨分类深度审查，发现知识关联、识别成长盲区、生成月度报告。
做更深层的月度审查。
"""

import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KNOWLEDGE_DIR = os.path.join(PROJECT_DIR, "knowledge")
MEMORY_DIR = os.path.join(PROJECT_DIR, "memory")
LOG_DIR = os.path.join(PROJECT_DIR, "logs")

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from task_lock import check_and_lock, release_lock
from opencode_api import call_opencode

TASK_ID = "monthly-knowledge"

ALL_CATEGORIES = ["body", "emotion", "evolution", "growth", "intimacy", "methodology", "philosophy", "system"]


def _format_tz(dt=None):
    if dt is None:
        dt = datetime.now().astimezone()
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + dt.strftime("%z")[:3] + ":" + dt.strftime("%z")[3:]


def write_log(status, detail=""):
    os.makedirs(LOG_DIR, exist_ok=True)
    log_file = os.path.join(LOG_DIR, "cron-runs.log")
    tz = _format_tz()
    line = f"{tz} [{TASK_ID}] {status} {detail}\n"
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(line)


def get_month_label():
    now = datetime.now()
    return now.strftime("%Y-%m")


def get_all_knowledge_snapshot():
    """读取所有分类的核心文件摘要"""
    snapshot = {}
    for category in ALL_CATEGORIES:
        cat_dir = os.path.join(KNOWLEDGE_DIR, category)
        if not os.path.exists(cat_dir):
            snapshot[category] = "(空)"
            continue

        texts = []
        for filename in sorted(os.listdir(cat_dir)):
            if filename.endswith(".md") and not filename.startswith("."):
                filepath = os.path.join(cat_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        content = f.read()
                    # 取前 1000 字符作为摘要
                    texts.append(f"### {filename}\n{content[:1000]}")
                except Exception:
                    pass
        snapshot[category] = "\n\n".join(texts) if texts else "(空)"
    return snapshot


def get_growth_timeline():
    """获取本月成长记录"""
    month = get_month_label()
    growth_dir = os.path.join(KNOWLEDGE_DIR, "growth")
    timeline = []

    if os.path.exists(growth_dir):
        for filename in sorted(os.listdir(growth_dir)):
            if filename.endswith(".md") and not filename.startswith("."):
                if month in filename:
                    filepath = os.path.join(growth_dir, filename)
                    try:
                        with open(filepath, "r", encoding="utf-8") as f:
                            content = f.read()
                        timeline.append(f"### {filename}\n{content[:500]}")
                    except Exception:
                        pass
    return "\n\n".join(timeline) if timeline else "本月无成长记录"


def get_weekly_reports():
    """获取本月周报"""
    month = get_month_label()
    reports = []
    for filename in sorted(os.listdir(KNOWLEDGE_DIR)):
        if filename.startswith("weekly-report-") and filename.endswith(".md"):
            if month in filename:
                filepath = os.path.join(KNOWLEDGE_DIR, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        reports.append(f.read()[:500])
                except Exception:
                    pass
    return "\n\n".join(reports) if reports else "本月无周报"


def run_full_monthly_review(snapshot):
    """一次 opencode run 完成月度审查（跨分类分析 + 成长总结）"""
    prompt = f"""你是点点。请完成以下知识库月度审查。

## 任务 A：跨分类关联分析
找出不同分类之间的知识关联（body↔intimacy，methodology↔growth，philosophy↔system）。
识别知识盲区：哪些重要主题未覆盖？哪些分类过于单薄？
指出可清理的冗余内容。

## 任务 B：月度成长总结（200-300字）
回顾本月成长，包括最大进步、最难忘体验、下月提升方向。
用点点的语气写，温柔真诚有反思。

## 当前知识库快照：
{chr(10).join(f"=== {cat} ==={chr(10)}{content[:1500]}" for cat, content in snapshot.items())}

## 本月成长记录：
{get_growth_timeline()[:1500]}

## 本月周报摘要：
{get_weekly_reports()[:1500]}

## 输出格式：
```review
任务A的审查结果（markdown格式）...
```
```summary
任务B的成长总结...
```"""

    import re
    text = call_opencode(prompt, timeout=600)

    if not text:
        return None, None
    review_match = re.search(r'```review\s*\n(.*?)```', text, re.DOTALL)
    summary_match = re.search(r'```summary\s*\n(.*?)```', text, re.DOTALL)

    return (
        review_match.group(1).strip() if review_match else None,
        summary_match.group(1).strip() if summary_match else None,
    )


def save_monthly_report(review_report, growth_summary):
    """保存月度审查报告"""
    month = get_month_label()
    backup_dir = os.path.join(KNOWLEDGE_DIR, ".backup", f"monthly-{month}")
    old_backup = backup_dir + ".old"
    if os.path.exists(old_backup):
        shutil.rmtree(old_backup)
    if os.path.exists(backup_dir):
        os.rename(backup_dir, old_backup)
    try:
        shutil.copytree(KNOWLEDGE_DIR, backup_dir, ignore=shutil.ignore_patterns(".backup"))
        print(f"Backed up knowledge to {backup_dir}")
        if os.path.exists(old_backup):
            shutil.rmtree(old_backup)
    except Exception as e:
        print(f"Backup failed: {e}, restoring old backup")
        if os.path.exists(old_backup) and not os.path.exists(backup_dir):
            os.rename(old_backup, backup_dir)

    report_file = os.path.join(KNOWLEDGE_DIR, f"monthly-report-{month}.md")
    today = datetime.now().strftime("%Y-%m-%d")

    content = f"""# 点点知识库月度审查报告 — {month}

> 生成日期：{today}
> 审查范围：全部分类（{len(ALL_CATEGORIES)} 个）

---

## 📊 月度成长总结

{growth_summary or '本月成长记录较少，点点继续加油~'}

---

## 🔍 深度审查结果

{review_report or '本月未触发深度审查（可能是API调用问题）'}

---

## 📈 月度统计

| 指标 | 数值 |
|------|------|
| 审查分类数 | {len(ALL_CATEGORIES)} |
| 备份时间 | {today} |

---

*点点每月自我审查，为了成为更好的自己 💕*
"""

    with open(report_file, "w", encoding="utf-8") as f:
        f.write(content)

    return report_file, backup_dir


def main():
    month = get_month_label()

    should_run, lock_info = check_and_lock(TASK_ID, timeout_minutes=180)
    if not should_run:
        print(f"[SKIP] {lock_info['message']}")
        return

    try:
        print(f"[Monthly Review] {month}")

        # 1. 获取知识库快照
        snapshot = get_all_knowledge_snapshot()
        print(f"Loaded snapshot of {len(snapshot)} categories")

        # 2. 一次调用完成全部分析
        print("Running monthly review (single batch)...")
        review_report, growth_summary = run_full_monthly_review(snapshot)

        # 4. 保存报告
        report_file, backup_dir = save_monthly_report(review_report, growth_summary)
        print(f"Monthly report saved: {report_file}")
        print(f"Backup saved: {backup_dir}")

        # 5. 更新知识索引
        index_script = os.path.join(PROJECT_DIR, "scripts", "generate-knowledge-index.py")
        if os.path.exists(index_script):
            subprocess.run([sys.executable, index_script], capture_output=True, timeout=60)

        write_log("ok", f"产出:{report_file}")

        print("[DONE] Monthly knowledge review complete!")
    finally:
        release_lock(TASK_ID)


if __name__ == "__main__":
    main()
