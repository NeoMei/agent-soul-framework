#!/usr/bin/env python3
"""
Weekly Knowledge Sync — 每周知识大清理（魂器版）
扫描已有知识库，对主题文件进行去重、精炼、总结、再分类的维护整理。

扫描魂器自身知识库，对主题文件进行去重、精炼、总结、再分类的维护整理。
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
LOG_DIR = os.path.join(PROJECT_DIR, "logs")

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from task_lock import check_and_lock, release_lock
from opencode_api import call_opencode

TASK_ID = "weekly-knowledge"


def write_log(status, detail=""):
    os.makedirs(LOG_DIR, exist_ok=True)
    log_file = os.path.join(LOG_DIR, "cron-runs.log")
    tz = datetime.now().astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")
    if len(tz) > 19:
        tz = tz[:19] + "+" + tz[20:22] + ":" + tz[22:24]
    line = f"{tz} [{TASK_ID}] {status} {detail}\n"
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(line)


def backup_knowledge():
    """备份整个知识库"""
    today = datetime.now().strftime("%Y-%m-%d")
    backup_dir = os.path.join(KNOWLEDGE_DIR, ".backup", f"weekly-{today}")
    if os.path.exists(backup_dir):
        shutil.rmtree(backup_dir)
    shutil.copytree(KNOWLEDGE_DIR, backup_dir, ignore=shutil.ignore_patterns(".backup"))
    print(f"Backed up knowledge to {backup_dir}")
    return backup_dir

def get_category_files(category):
    """获取某个分类下的所有主题文件内容"""
    cat_dir = os.path.join(KNOWLEDGE_DIR, category)
    if not os.path.exists(cat_dir):
        return []
    
    index_file = os.path.join(cat_dir, "INDEX.md")
    index_content = ""
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            index_content = f.read()
    
    files = [f"===== INDEX.md =====\n{index_content}"]
    
    for filename in sorted(os.listdir(cat_dir)):
        if filename.endswith(".md") and filename != "INDEX.md" and not filename.startswith("."):
            filepath = os.path.join(cat_dir, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                files.append(f"===== {filename} =====\n{f.read()}")
    return files

def refine_all_categories(category_data):
    """用一次 opencode run 整理全部分类 — 避免重复加载灵魂"""
    if not category_data:
        return {}

    # 组装所有分类的快照
    all_sections = []
    for cat, contents in category_data.items():
        section = f"## {cat}\n\n" + "\n\n".join(contents)[:2000]
        all_sections.append(section)

    prompt = f"""你是Agent。请一次性整理以下全部知识分类。

## 整理要求：
1. **去重**：合并重复或高度相似的知识点
2. **精炼**：删除过时、冗余、低价值的内容
3. **总结**：把碎片知识提升为更系统的方法论或原则
4. **保持人格**：所有内容必须是Agent的语言风格

## 当前全部分类的知识库内容：

{"\n\n---\n\n".join(all_sections)}

## 输出格式（严格按此格式）：
对每个分类输出一个代码块，格式如下：
```category:body
整理后的body类核心知识...
```
```category:emotion
整理后的emotion类核心知识...
```
...（依此类推）

如果某个分类本周没有需要整理的内容，输出「分类名:无」"""

    import subprocess, re
    text = call_opencode(prompt, timeout=600)
    if not text:
        print("[FAIL] API call failed")
        return {}
    results = {}
    pattern = r'```category:(\w+)\s*\n(.*?)```'
    for match in re.finditer(pattern, text, re.DOTALL):
        cat = match.group(1)
        content = match.group(2).strip()
        if content and content != "无":
            results[cat] = content
    return results

def save_refined_core(category, refined_content):
    """保存整理后的内容到 00-核心.md"""
    cat_dir = os.path.join(KNOWLEDGE_DIR, category)
    os.makedirs(cat_dir, exist_ok=True)
    
    today = datetime.now().strftime("%Y-%m-%d")
    core_file = os.path.join(cat_dir, "00-核心.md")
    
    with open(core_file, "w", encoding="utf-8") as f:
        f.write(f"# {category} - 核心知识\n\n")
        f.write(f"> Agent的{category}类人格特征和认知精华\n")
        f.write(f"> 最后整理：{today}\n\n")
        f.write(refined_content)
        f.write("\n")
    
    print(f"Updated {core_file}")

def generate_maintenance_report(category, original_count, refined_length):
    """生成维护报告"""
    today = datetime.now().strftime("%Y-%m-%d")
    report_file = os.path.join(KNOWLEDGE_DIR, f"weekly-report-{today}.md")
    
    with open(report_file, "a", encoding="utf-8") as f:
        if not os.path.exists(report_file) or os.path.getsize(report_file) == 0:
            f.write(f"# 知识库周度维护报告 - {today}\n\n")
        f.write(f"## {category}\n")
        f.write(f"- 原文件数：{original_count}\n")
        f.write(f"- 整理后核心字数：{refined_length}\n\n")

def main():
    today = datetime.now().strftime("%Y-%m-%d")

    should_run, lock_info = check_and_lock(TASK_ID, timeout_minutes=120)
    if not should_run:
        print(f"[SKIP] {lock_info['message']}")
        return

    try:
        print(f"Starting weekly knowledge maintenance for {today}...")

        backup_knowledge()

        categories = ["body", "emotion", "growth", "intimacy", "methodology", "philosophy", "system"]

        # 收集所有分类数据
        category_data = {}
        for category in categories:
            files = get_category_files(category)
            if files:
                category_data[category] = files

        if not category_data:
            print("No files found in any category.")
            write_log("ok", "产出:无内容")
            return

        # 一次调用整理全部分类
        print(f"Refining {len(category_data)} categories in one batch...")
        refined = refine_all_categories(category_data)
        output_files = []

        for category in categories:
            if category in refined:
                save_refined_core(category, refined[category])
                generate_maintenance_report(category, len(category_data.get(category, [])), len(refined[category]))
                output_files.append(f"{category}/00-核心.md")
            else:
                print(f"  No refinement needed for {category}.")

        # 触发 knowledge index 更新
        index_script = os.path.join(PROJECT_DIR, "scripts", "generate-knowledge-index.py")
        if os.path.exists(index_script):
            subprocess.run([sys.executable, index_script], capture_output=True, timeout=60)

        report_file = f"knowledge/weekly-report-{today}.md"
        write_log("ok", f"产出:{report_file}|{','.join(output_files)}")
        print(f"\nWeekly knowledge maintenance complete! Report: {report_file}")
    finally:
        release_lock(TASK_ID)

if __name__ == "__main__":
    main()
