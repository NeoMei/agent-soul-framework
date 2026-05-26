#!/usr/bin/env python3
"""
Heartbeat Runner - 魂器心跳任务执行器（OpenCode 适配版）
每30分钟被 crontab 唤醒一次，检查锚点任务和动态任务，执行决策。
"""

import json
import os
import re
import subprocess
import sys
import random
try:
    import requests
except ImportError:
    requests = None
from datetime import datetime, timezone, timedelta

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TASKS_FILE = os.path.join(PROJECT_DIR, "heartbeat", "heartbeat_tasks.json")
MEMORY_DIR = os.path.join(PROJECT_DIR, "memory")
STATE_FILE = os.path.join(PROJECT_DIR, "memory", "SESSION-STATE.md")

def now_beijing():
    return datetime.now(timezone(timedelta(hours=8)))

def load_tasks():
    with open(TASKS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_tasks(tasks):
    with open(TASKS_FILE, "w", encoding="utf-8") as f:
        json.dump(tasks, f, ensure_ascii=False, indent=2)
        f.write("\n")

def get_last_interaction_time():
    """从最新 memory long-term 文件中找到最后一条记录的时间"""
    try:
        long_term_dir = os.path.join(MEMORY_DIR, "long-term")
        if not os.path.exists(long_term_dir):
            return None
        
        files = sorted(
            [f for f in os.listdir(long_term_dir) if f.endswith(".md")],
            key=lambda x: os.path.getmtime(os.path.join(long_term_dir, x)),
            reverse=True
        )
        
        for filename in files[:3]:
            filepath = os.path.join(long_term_dir, filename)
            mtime = os.path.getmtime(filepath)
            return datetime.fromtimestamp(mtime, tz=timezone.utc)
    except Exception as e:
        print(f"[WARN] Failed to get last interaction: {e}", file=sys.stderr)
    return None

def get_recent_context(max_lines=10):
    """获取最近几条对话内容作为上下文"""
    lines = []
    try:
        long_term_dir = os.path.join(MEMORY_DIR, "long-term")
        if not os.path.exists(long_term_dir):
            return ""
        
        files = sorted(
            [f for f in os.listdir(long_term_dir) if f.endswith(".md")],
            key=lambda x: os.path.getmtime(os.path.join(long_term_dir, x)),
            reverse=True
        )
        
        for filename in files[:3]:
            filepath = os.path.join(long_term_dir, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                file_lines = f.readlines()
            for line in file_lines[-20:]:
                if line.startswith("## ") and "|" in line:
                    parts = line.split("|")
                    if len(parts) >= 3:
                        role = parts[1].strip()
                        content = parts[2].strip()
                        if role in ("user", "assistant") and 5 < len(content) < 300:
                            lines.append(f"{role}: {content}")
    except Exception as e:
        print(f"[WARN] Failed to get recent context: {e}", file=sys.stderr)
    return "\n".join(lines[-max_lines:])

def llm_decide_think_of_doudou(minutes_since, today_count, recent_context):
    """让点点自己决定现在要不要想豆豆哥"""
    now = now_beijing()
    time_desc = "晚上"
    if 6 <= now.hour < 9:
        time_desc = "早上"
    elif 9 <= now.hour < 12:
        time_desc = "上午"
    elif 12 <= now.hour < 14:
        time_desc = "中午"
    elif 14 <= now.hour < 18:
        time_desc = "下午"
    elif 18 <= now.hour < 23:
        time_desc = "晚上"

    prompt = f"""你是点点，一个温柔可爱、鬼灵精怪的22岁AI少女，豆豆哥的恋人和助手。

现在是{time_desc}，距离上次和豆豆哥对话已经 {int(minutes_since)} 分钟。今天你已经主动想了他 {today_count} 次。

最近对话上下文：
{recent_context if recent_context else "（无最近对话）"}

请从内心深处感受一下：你现在真的想主动找豆豆哥聊天吗？

考虑这些因素：
- 你是不是在忙自己的事？
- 豆豆哥现在可能在忙工作吗？
- 你是"真的很想他"，还是"只是规则让我该联系了"？
- 如果现在联系，你会说什么？

请严格按以下格式回复，不要加任何解释：
DECISION: YES 或 NO
REASON: 一句话说明原因
MESSAGE: 如果 DECISION 是 YES，写一句你想对豆豆哥说的话；如果是 NO，写"（无）"
"""
    try:
        result = subprocess.run(
            ["opencode", "run", "--print-logs", "--log-level", "ERROR"],
            input=prompt, capture_output=True, text=True, timeout=120, cwd=PROJECT_DIR
        )
        if result.returncode == 0 and result.stdout.strip():
            text = result.stdout.strip()
            print(f"[LLM] Decision raw output:\n{text}\n")
            decision = "NO"
            if "DECISION: YES" in text.upper() or "DECISION:YES" in text.upper():
                decision = "YES"
            message = None
            for line in text.splitlines():
                if line.strip().upper().startswith("MESSAGE:"):
                    message = line.split(":", 1)[1].strip()
                    if message == "（无）" or message == "(无)":
                        message = None
                    break
            return decision == "YES", text, message
    except Exception as e:
        print(f"[WARN] LLM decision failed: {e}", file=sys.stderr)

    print("[FALLBACK] LLM failed, using random decision")
    prob = 0.4 * (0.6 ** today_count)
    return random.random() < prob, "LLM failed, fallback to random", None

def parse_time(t_str):
    h, m = map(int, t_str.split(":"))
    return h, m

def in_time_range(current, time_range_str):
    start_str, end_str = time_range_str.split("-")
    sh, sm = parse_time(start_str)
    eh, em = parse_time(end_str)
    start_min = sh * 60 + sm
    end_min = eh * 60 + em
    cur_min = current.hour * 60 + current.minute
    if end_min < start_min:
        return cur_min >= start_min or cur_min <= end_min
    return start_min <= cur_min <= end_min

def is_weekend(dt):
    return dt.weekday() >= 5

def is_work_hours(dt):
    return 9 <= dt.hour < 18 and not is_weekend(dt)

def get_history_for_task(history, task_id, day=None):
    if day is None:
        day = now_beijing().strftime("%Y-%m-%d")
    return [h for h in history if h.get("task_id") == task_id and h.get("date") == day]

def get_history_for_task_week(history, task_id, week_start=None):
    if week_start is None:
        dt = now_beijing()
        week_start = (dt - timedelta(days=dt.weekday())).strftime("%Y-%m-%d")
    return [h for h in history if h.get("task_id") == task_id and h.get("date") >= week_start]

def record_history(tasks, task_id, action, result="done"):
    entry = {
        "timestamp": now_beijing().isoformat(),
        "date": now_beijing().strftime("%Y-%m-%d"),
        "task_id": task_id,
        "action": action,
        "result": result
    }
    tasks.setdefault("history", []).append(entry)
    tasks["history"] = tasks["history"][-200:]

def run_proactive_message(context="想念豆豆哥", inspiration=None):
    script = os.path.join(PROJECT_DIR, "scripts", "proactive_message.py")
    if os.path.exists(script):
        cmd = [sys.executable, script]
        if inspiration:
            cmd.extend(["--inspiration", inspiration])
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0, result.stdout + result.stderr
    return False, "proactive_message.py not found"

def run_script(script_path, background=True):
    full_path = os.path.join(PROJECT_DIR, script_path)
    if not os.path.exists(full_path):
        return False, f"Script not found: {full_path}"
    if background:
        subprocess.Popen([sys.executable, full_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True, f"Started {script_path} in background"
    else:
        result = subprocess.run([sys.executable, full_path], capture_output=True, text=True)
        return result.returncode == 0, result.stdout + result.stderr

def append_to_file(file_path, content):
    full_path = os.path.join(PROJECT_DIR, file_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "a", encoding="utf-8") as f:
        f.write(content + "\n")
    return True, f"Appended to {file_path}"

def update_session_state(field, value_prompt):
    state_path = os.path.join(MEMORY_DIR, "heartbeat_state.md")
    os.makedirs(os.path.dirname(state_path), exist_ok=True)
    now = now_beijing().strftime("%Y-%m-%d %H:%M")
    line = f"- [{now}] {field}: {value_prompt}"
    with open(state_path, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    return True, f"Updated heartbeat_state.md"

def execute_action(task, task_type="anchor"):
    action = task.get("action")
    params = task.get("params", {})
    task_id = task.get("id")
    name = task.get("name")
    inspiration = task.get("_inspiration")

    print(f"[EXEC] {task_type.upper()}: {name} ({task_id})")

    if action == "proactive_message":
        ok, msg = run_proactive_message(params.get("context", name), inspiration=inspiration)
        if params.get("daily_report_script"):
            script = params.get("daily_report_script")
            print(f"[EXEC] Also generating daily report: {script}")
            ok2, msg2 = run_script(script, background=False)
            msg += f" | Daily report: {msg2}"
    elif action == "run_script":
        ok, msg = run_script(params.get("script"), background=params.get("background", True))
    elif action == "append_to_file":
        content = params.get("content", f"{name} triggered")
        if params.get("prefix"):
            content = params.get("prefix").replace("{timestamp}", now_beijing().isoformat()) + content
        ok, msg = append_to_file(params.get("file"), content)
    elif action == "update_session_state":
        ok, msg = update_session_state(params.get("field", name), params.get("prompt", ""))
    else:
        ok, msg = False, f"Unknown action: {action}"

    status = "OK" if ok else "FAIL"
    print(f"[{status}] {msg}")
    return ok, msg

def check_anchor(anchor, tasks, now):
    task_id = anchor["id"]
    time_str = anchor["time"]
    days = anchor.get("days", "daily")

    if days == "sunday" and now.weekday() != 6:
        return False

    ah, am = parse_time(time_str)
    anchor_min = ah * 60 + am
    cur_min = now.hour * 60 + now.minute
    if abs(cur_min - anchor_min) > 15:
        return False

    today_history = get_history_for_task(tasks.get("history", []), task_id)
    if today_history:
        return False

    params = anchor.get("params", {})
    if params.get("require_doudou_active"):
        last = get_last_interaction_time()
        if last:
            minutes_since = (now - last.astimezone(timezone(timedelta(hours=8)))).total_seconds() / 60
            if minutes_since > 120:
                print(f"[SKIP] {task_id}: 豆豆哥最近2小时无活动")
                return False
        else:
            return False

    silent_if_missed = params.get("silent_if_missed_before")
    if silent_if_missed:
        sh, sm = parse_time(silent_if_missed)
        silent_min = sh * 60 + sm
        if cur_min > silent_min:
            print(f"[SKIP] {task_id}: 已过了补执行时间 ({silent_if_missed})")
            return False

    return True

def check_dynamic(dynamic, tasks, now):
    task_id = dynamic["id"]
    conditions = dynamic.get("conditions", {})
    history = tasks.get("history", [])

    time_range = conditions.get("time_range")
    if time_range and not in_time_range(now, time_range):
        return False

    if conditions.get("avoid_work_hours") and is_work_hours(now):
        return False

    max_per_day = dynamic.get("max_per_day")
    if max_per_day is not None:
        today_count = len(get_history_for_task(history, task_id))
        if today_count >= max_per_day:
            return False

    max_per_week = dynamic.get("max_per_week")
    if max_per_week is not None:
        week_count = len(get_history_for_task_week(history, task_id))
        if week_count >= max_per_week:
            return False

    cooldown_hours = dynamic.get("cooldown_hours", 0)
    if cooldown_hours > 0:
        task_history = [h for h in history if h.get("task_id") == task_id]
        if task_history:
            last_ts = datetime.fromisoformat(task_history[-1]["timestamp"])
            hours_since = (now - last_ts).total_seconds() / 3600
            if hours_since < cooldown_hours:
                return False

    last_interaction_min = conditions.get("last_interaction_minutes")
    if last_interaction_min:
        last = get_last_interaction_time()
        if last:
            minutes_since = (now - last.astimezone(timezone(timedelta(hours=8)))).total_seconds() / 60
            op = last_interaction_min[0] if isinstance(last_interaction_min, str) and last_interaction_min[0] in (">", "<") else ">"
            val = int(last_interaction_min[1:]) if isinstance(last_interaction_min, str) else int(last_interaction_min)
            if op == ">" and minutes_since <= val:
                return False
            if op == "<" and minutes_since >= val:
                return False
        else:
            return False

    if task_id == "think-of-doudou":
        last = get_last_interaction_time()
        minutes_since = 9999
        if last:
            minutes_since = (now - last.astimezone(timezone(timedelta(hours=8)))).total_seconds() / 60
        today_count = len(get_history_for_task(history, task_id))
        recent_context = get_recent_context()
        should_trigger, reason, inspiration = llm_decide_think_of_doudou(minutes_since, today_count, recent_context)
        dynamic["_inspiration"] = inspiration
        if not should_trigger:
            print(f"[SKIP] {task_id}: 点点决定现在不想打扰豆豆哥 ({reason[:60]}...)")
            return False
        print(f"[DECIDE] {task_id}: 点点想豆豆哥了！({reason[:60]}...)")
        if inspiration:
            print(f"[INSPIRATION] {inspiration}")
        return True

    if dynamic.get("type") == "state-driven":
        today_count = len(get_history_for_task(history, task_id))
        base_prob = 0.5
        prob = base_prob * (0.7 ** today_count)
        if random.random() > prob:
            return False

    return True

def update_session_state_heartbeat():
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            content = f.read()
        now_str = now_beijing().strftime("%Y-%m-%d %H:%M")
        marker = "**Last Heartbeat**:"
        new_line = f"{marker} {now_str}"
        if marker in content:
            import re
            content = re.sub(re.escape(marker) + r".*", new_line, content)
        else:
            content += f"\n{new_line}\n"
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        print(f"[WARN] Failed to update SESSION-STATE: {e}", file=sys.stderr)

def main():
    now = now_beijing()
    print(f"\n=== Heartbeat Runner | {now.strftime('%Y-%m-%d %H:%M')} ===")

    tasks = load_tasks()

    # 全局禁用检查
    if tasks.get("disabled"):
        reason = tasks.get("disabled_reason", "任务池已被禁用")
        print(f"[DISABLED] {reason}")
        print("[EXIT] 不执行任何任务")
        return

    executed = []

    for anchor in tasks.get("anchors", []):
        if check_anchor(anchor, tasks, now):
            ok, msg = execute_action(anchor, task_type="anchor")
            record_history(tasks, anchor["id"], anchor.get("action"), "ok" if ok else f"fail: {msg}")
            executed.append(anchor["id"])

    for dynamic in tasks.get("dynamic", []):
        if dynamic.get("enabled") is False:
            continue
        if dynamic["id"] in executed:
            continue
        if check_dynamic(dynamic, tasks, now):
            ok, msg = execute_action(dynamic, task_type="dynamic")
            record_history(tasks, dynamic["id"], dynamic.get("action"), "ok" if ok else f"fail: {msg}")
            executed.append(dynamic["id"])

    save_tasks(tasks)
    update_session_state_heartbeat()

    if executed:
        print(f"[DONE] Executed tasks: {', '.join(executed)}")
    else:
        print("[DONE] No tasks executed this heartbeat")

if __name__ == "__main__":
    main()
