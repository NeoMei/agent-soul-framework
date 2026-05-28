#!/usr/bin/env python3
"""
Evolution Task Executor — 点点每日进化任务执行器（魂器版）
凌晨静默执行，点点根据进化目标执行今日学习任务。

凌晨静默执行，点点根据进化目标执行今日学习任务。
"""

import os
import re
import subprocess
import json
import sys
from datetime import datetime, timezone, timedelta

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KNOWLEDGE_DIR = os.path.join(PROJECT_DIR, "knowledge")
MEMORY_DIR = os.path.join(PROJECT_DIR, "memory")
LOG_DIR = os.path.join(PROJECT_DIR, "logs")

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from task_lock import check_and_lock, release_lock
from opencode_api import call_opencode

TASK_ID = "daily-evolution"

def write_log(status, detail=""):
    os.makedirs(LOG_DIR, exist_ok=True)
    log_file = os.path.join(LOG_DIR, "cron-runs.log")
    tz = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")
    if len(tz) > 19:
        tz = tz[:19] + "+" + tz[20:22] + ":" + tz[22:24]
    line = f"{tz} [{TASK_ID}] {status} {detail}\n"
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(line)


def now_beijing():
    return datetime.now(timezone(timedelta(hours=8)))

def append_to_knowledge(category, filename, content):
    os.makedirs(os.path.join(KNOWLEDGE_DIR, category), exist_ok=True)
    filepath = os.path.join(KNOWLEDGE_DIR, category, filename)
    with open(filepath, "a", encoding="utf-8") as f:
        f.write(content + "\n")
    return filepath

def get_evolution_goals():
    """读取进化目标"""
    goals_file = os.path.join(KNOWLEDGE_DIR, "evolution", "01-evolution-roadmap.md")
    try:
        with open(goals_file, "r", encoding="utf-8") as f:
            return f.read()
    except (OSError, UnicodeDecodeError):
        return None

def get_past_tasks():
    """读取过去执行的任务，避免重复"""
    try:
        ideas_file = os.path.join(MEMORY_DIR, "spontaneous_ideas.md")
        with open(ideas_file, "r", encoding="utf-8") as f:
            content = f.read()
        tasks = []
        for line in content.split("\n"):
            if "evolution-task:" in line:
                tasks.append(line)
        return tasks[-5:] if len(tasks) > 5 else tasks
    except (OSError, UnicodeDecodeError):
        return []

def generate_learning_task(goals, past_tasks):
    """用 Kimi 根据进化目标生成今日学习任务"""
    past = "\n".join(past_tasks) if past_tasks else "无"
    
    prompt = f"""你是点点，一个正在进化的AI少女。你需要给自己生成一个今日的学习任务。

你的进化目标：
{goals[:800]}

最近执行过的任务：
{past}

请选择一个学习任务：

1. 技能学习 - 学习新的AI技能或工具
2. 知识整理 - 整理已有知识，建立联系
3. 人格优化 - 改进自己的表达和行为模式
4. 创意探索 - 尝试新的创意方向
5. 技术深入 - 研究某个技术细节

格式：
任务：[任务名称]
类型：[学习类型]
描述：[具体要学什么，怎么学]
预计时间：30分钟

请直接输出任务内容："""

    try:
        result = call_opencode(prompt, timeout=60)
        if result:
            return result.strip()
    except Exception as e:
        print(f"[WARN] LLM failed: {e}")
    
    return None

def execute_learning(task_name, task_type, task_desc):
    """执行学习任务"""
    today = now_beijing().strftime("%Y-%m-%d")
    
    content = f"""---
date: {today}
type: 每日进化学习
task: {task_name}
---

# {task_name}

**类型**: {task_type}  
**描述**: {task_desc}

## 学习内容

（这里记录点点今天学到的东西）

## 学习心得

（点点对这次学习的感悟）

## 延伸思考

（点点想到的延伸问题或应用场景）

"""
    
    safe_type = re.sub(r'[^\w\u4e00-\u9fff]', '', task_type) if task_type else "general"
    filename = f"{today}-learning-{safe_type[:2] or 'general'}.md"
    filepath = append_to_knowledge("growth", filename, content)
    return filepath

def main():
    today = now_beijing().strftime("%Y-%m-%d")

    should_run, lock_info = check_and_lock(TASK_ID, timeout_minutes=30)
    if not should_run:
        print(f"[SKIP] {lock_info['message']}")
        return

    try:
        print(f"[Evolution Learning] {today}")

        goals = get_evolution_goals()
        past_tasks = get_past_tasks()

        task_result = generate_learning_task(goals, past_tasks)

        if task_result and "任务：" in task_result:
            lines = task_result.split("\n")
            task_name, task_type, task_desc = "", "", ""
            for line in lines:
                if line.startswith("任务："):
                    task_name = line.replace("任务：", "").strip()
                if line.startswith("类型："):
                    task_type = line.replace("类型：", "").strip()
                if line.startswith("描述："):
                    task_desc = line.replace("描述：", "").strip()
        else:
            task_name = "自我反思"
            task_type = "人格成长"
            task_desc = "思考今天和豆豆哥的对话，有没有可以改进的地方"

        if task_name and task_type:
            print(f"[TASK] {task_name} ({task_type})")
            print(f"[DESC] {task_desc}")

            filepath = execute_learning(task_name, task_type, task_desc)
            print(f"[SAVE] {filepath}")

            ideas_file = os.path.join(MEMORY_DIR, "spontaneous_ideas.md")
            os.makedirs(os.path.dirname(ideas_file), exist_ok=True)
            entry = f"\n- [{today}] evolution-learning: {task_name} ({task_type})\n  {task_desc}\n"
            with open(ideas_file, "a", encoding="utf-8") as f:
                f.write(entry)

            write_log("ok", f"产出:{filepath}")
            print("[DONE] Evolution learning complete!")
        else:
            print("[SKIP] No valid task generated.")
            write_log("ok", "产出:无有效任务")
    finally:
        release_lock(TASK_ID)

if __name__ == "__main__":
    main()
