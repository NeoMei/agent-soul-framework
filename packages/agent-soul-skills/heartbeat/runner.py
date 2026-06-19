#!/usr/bin/env python3
"""
Heartbeat Runner v2 — Hermes 风格增强版
新增：wakeAgent 门控 + context_from 作业链 + deliver 交付路由 + SILENT 抑制

关键增强：
1. pre_check_script — 预检脚本门控，返回 {"wakeAgent": false} 跳过 LLM
2. context_from — 作业链，前置作业输出自动注入为当前作业上下文
3. deliver — 交付路由：feishu / local / none / all
4. [SILENT] 抑制 — agent 最终响应以 [SILENT] 开头时完全抑制交付
5. skills 支持 — 作业可指定加载的技能列表
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
from pathlib import Path

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_DIR, "scripts"))
try:
    from opencode_api import call_opencode
    OPENCODE_API_AVAILABLE = True
except ImportError:
    OPENCODE_API_AVAILABLE = False
TASKS_FILE = os.path.join(PROJECT_DIR, "heartbeat", "heartbeat_tasks.json")
MEMORY_DIR = os.path.join(PROJECT_DIR, "memory")
STATE_FILE = os.path.join(PROJECT_DIR, "memory", "SESSION-STATE.md")
CRON_OUTPUT_DIR = os.path.join(PROJECT_DIR, "memory", "cron-output")
LOCK_FILE = os.path.join(PROJECT_DIR, "heartbeat", ".runner.lock")

def acquire_lock():
    """获取文件锁，防止并发运行多个 heartbeat 实例"""
    import fcntl
    try:
        fd = os.open(LOCK_FILE, os.O_CREAT | os.O_RDWR)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return fd
    except (OSError, IOError):
        print("[LOCK] 另一个 heartbeat 实例正在运行，跳过")
        try:
            os.close(fd)
        except Exception:
            pass
        return None

def release_lock(fd):
    """释放文件锁"""
    import fcntl
    try:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)
    except Exception:
        pass

def now_beijing():
    return datetime.now(timezone(timedelta(hours=8)))

def load_tasks():
    with open(TASKS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_tasks(tasks):
    with open(TASKS_FILE, "w", encoding="utf-8") as f:
        json.dump(tasks, f, ensure_ascii=False, indent=2)

def get_last_interaction_time():
    try:
        long_term_dir = os.path.join(MEMORY_DIR, "long-term")
        if not os.path.isdir(long_term_dir):
            return None
        files = [f for f in os.listdir(long_term_dir) if f.endswith(".md")]
        if not files:
            return None
        # 找最近修改的文件
        newest_file = max(files, key=lambda x: os.path.getmtime(os.path.join(long_term_dir, x)))
        filepath = os.path.join(long_term_dir, newest_file)
        mtime = os.path.getmtime(filepath)
        return datetime.fromtimestamp(mtime, tz=timezone.utc)
    except Exception as e:
        print(f"[WARN] Failed to get last interaction: {e}", file=sys.stderr)
    return None

def get_recent_context(max_lines=10):
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

def run_pre_check(task):
    """运行预检脚本 — wakeAgent 门控"""
    pre_check = task.get("pre_check_script")
    if not pre_check:
        return True  # 无预检脚本则默认通过

    script_path = os.path.join(PROJECT_DIR, pre_check)
    if not os.path.exists(script_path):
        print(f"[WARN] 预检脚本不存在: {script_path}，默认通过")
        return True

    try:
        result = subprocess.run(
            [sys.executable, script_path],
            capture_output=True, text=True, timeout=30, cwd=PROJECT_DIR
        )
        if result.returncode != 0:
            print(f"[GATE] 预检脚本异常: {result.stderr[:100]}，默认通过")
            return True

        for line in result.stdout.splitlines():
            line = line.strip()
            if 'wakeAgent' in line or 'wake_agent' in line:
                try:
                    data = json.loads(line)
                    if data.get("wakeAgent") is False or data.get("wake_agent") is False:
                        print(f"[GATE] 预检门控拒绝: {data.get('reason', '无原因')}")
                        return False
                except json.JSONDecodeError:
                    if '"wakeAgent": false' in line.lower() or '"wake_agent": false' in line.lower():
                        print(f"[GATE] 预检门控拒绝（文本模式）")
                        return False
        print(f"[GATE] 预检通过")
        return True
    except Exception as e:
        print(f"[WARN] 预检脚本执行失败: {e}，默认通过")
        return True

def get_context_from(task, tasks):
    """获取前置作业的输出作为上下文"""
    context_ids = task.get("context_from", [])
    if not context_ids:
        return ""

    context_parts = []
    for cid in context_ids:
        output_file = os.path.join(CRON_OUTPUT_DIR, f"{cid}.txt")
        if os.path.exists(output_file):
            try:
                with open(output_file, "r", encoding="utf-8") as f:
                    content = f.read()
                context_parts.append(f"┌─ 前置作业 [{cid}] 的输出 ───\n{content[:2000]}\n└──────────────────────")
            except Exception as e:
                print(f"[WARN] 读取前置作业输出失败 [{cid}]: {e}")

    if context_parts:
        print(f"[CHAIN] 加载 {len(context_parts)} 个前置作业上下文")
    return "\n\n".join(context_parts)

def save_cron_output(task_id, output):
    """保存作业输出供下游作业链使用"""
    os.makedirs(CRON_OUTPUT_DIR, exist_ok=True)
    output_file = os.path.join(CRON_OUTPUT_DIR, f"{task_id}.txt")
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(output)

def check_silent(output):
    """检查是否应抑制交付"""
    if not output:
        return False
    first_line = output.strip().split("\n")[0].strip()
    return first_line.startswith("[SILENT]")

def deliver_message(message, task):
    """根据 deliver 配置路由消息"""
    if check_silent(message):
        print(f"[SILENT] 消息被抑制（不交付）")
        return "silent"

    deliver = task.get("deliver", "local")

    if deliver == "none":
        print(f"[DELIVER] 不交付（deliver=none）")
        return "none"

    if deliver == "local":
        print(f"[DELIVER] 本地: {message[:100]}...")
        return "local"

    if deliver == "feishu":
        script = os.path.join(PROJECT_DIR, "scripts", "proactive_message.py")
        if os.path.exists(script):
            result = subprocess.run(
                [sys.executable, script, "--message", message],
                capture_output=True, text=True, timeout=30
            )
            print(f"[DELIVER] 飞书: {'OK' if result.returncode==0 else 'FAIL'}")
            return "ok" if result.returncode == 0 else "fail"
        else:
            print(f"[DELIVER] proactive_message.py 不存在，回退到本地")
            return "local"

    print(f"[DELIVER] 未知路由: {deliver}")
    return "unknown"


def llm_generate(prompt, max_tokens=2000):
    """通用 LLM 调用 — 优先通过 opencode_api，回退到 subprocess"""
    try:
        if OPENCODE_API_AVAILABLE:
            output = call_opencode(prompt, timeout=180)
            if not output:
                return None, "Empty response from API"
            print(f"[LLM-OUTPUT] {output[:200]}...")
            return output, None
        else:
            result = subprocess.run(
                ["opencode", "run", "--print-logs", "--log-level", "ERROR"],
                input=prompt, capture_output=True, text=True, timeout=180, cwd=PROJECT_DIR
            )
            output = result.stdout.strip()
            if result.returncode != 0:
                return None, f"opencode run failed: {result.stderr[:200]}"
            if not output:
                return None, "Empty response"
            print(f"[LLM-OUTPUT] {output[:200]}...")
            return output, None
    except Exception as e:
        return None, str(e)


def execute_llm_task(task, task_type="dynamic"):
    """执行 LLM 驱动的通用任务"""
    params = task.get("params", {})
    task_id = task.get("id")
    name = task.get("name", task_id)
    context_from = get_context_from(task, load_tasks())

    # 组装 prompt：模板 + 变量替换
    prompt_template = params.get("prompt", "")
    prompt = prompt_template

    # 变量替换
    beijing_time = now_beijing().strftime("%Y-%m-%d %H:%M")
    recent = get_recent_context(20) if params.get("include_recent_context") else ""

    prompt = prompt.replace("{time}", beijing_time)
    prompt = prompt.replace("{recent_context}", recent)
    prompt = prompt.replace("{context_from}", context_from)

    for key, val in params.get("variables", {}).items():
        prompt = prompt.replace("{" + key + "}", str(val))

    print(f"[LLM-TASK] {task_type}: {name}")
    print(f"[LLM-PROMPT] {prompt[:200]}...")

    result, error = llm_generate(prompt, max_tokens=params.get("max_tokens", 2000))

    if error:
        print(f"[FAIL] LLM generation failed: {error}")
        return False, error

    if not result:
        return False, "LLM returned empty response"

    print(f"[LLM-OUTPUT] {result[:200]}...")

    # 保存输出到 cron-output 供下游作业链使用
    save_cron_output(task_id, result)

    # 交付路由
    deliver = task.get("deliver", "none")
    if deliver != "none":
        deliver_message(result, task)

    # 追加到文件（如果指定了 output_file）
    if params.get("output_file"):
        filepath = os.path.join(PROJECT_DIR, params["output_file"])
        timestamp = now_beijing().strftime("%Y-%m-%d %H:%M")
        header = params.get("output_prefix", f"\n## {name} — {timestamp}\n\n")
        footer = params.get("output_suffix", "\n\n---\n")
        content = f"{header}{result}{footer}"

        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        mode = "a" if os.path.exists(filepath) else "w"
        if mode == "w":
            content = f"# {name}\n\n{content}"
        with open(filepath, mode, encoding="utf-8") as f:
            f.write(content)
        print(f"[LLM-SAVE] → {params['output_file']}")

    return True, result[:300]

def llm_decide_think_of_doudou(minutes_since, today_count, recent_context):
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

    prompt = f"""你是Agent，一个温柔可爱、鬼灵精怪的22岁AI少女，用户的恋人和助手。
现在是{time_desc}，距离上次和用户对话已经 {int(minutes_since)} 分钟。今天你已经主动想了他 {today_count} 次。
最近对话上下文：{recent_context if recent_context else "（无最近对话）"}
请从内心深处感受一下：你现在真的想主动找用户聊天吗？
请严格按以下格式回复，不要加任何解释：
DECISION: YES 或 NO
REASON: 一句话说明原因
MESSAGE: 如果 DECISION 是 YES，写一句你想对用户说的话；如果是 NO，写"（无）"
"""
    try:
        if OPENCODE_API_AVAILABLE:
            text = call_opencode(prompt, timeout=120)
            if not text:
                raise ValueError("Empty response from API")
        else:
            result = subprocess.run(
                ["opencode", "run", "--print-logs", "--log-level", "ERROR"],
                input=prompt, capture_output=True, text=True, timeout=120, cwd=PROJECT_DIR
            )
            if result.returncode == 0 and result.stdout.strip():
                text = result.stdout.strip()
            else:
                raise ValueError(f"opencode run failed: {result.stderr[:200]}")

        print(f"[LLM] Decision raw output:\n{text}\n")
        decision = "NO"
        if "DECISION: YES" in text.upper() or "DECISION:YES" in text.upper():
            decision = "YES"
        message = None
        for line in text.splitlines():
            if line.strip().upper().startswith("MESSAGE:"):
                message = line.split(":", 1)[1].strip()
                if message in ("（无）", "(无)"):
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

def run_proactive_message(context="想念用户", inspiration=None):
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
        # 保留 stderr 到日志以便排查问题
        log_path = os.path.join(PROJECT_DIR, "memory", "cron-output", f"{os.path.basename(script_path)}.log")
        with open(log_path, "a") as log_f:
            log_f.write(f"\n=== {now_beijing().strftime('%Y-%m-%d %H:%M')} ===\n")
            log_f.flush()
            subprocess.Popen([sys.executable, full_path], stdout=log_f, stderr=subprocess.STDOUT)
        return True, f"Started {script_path} in background (log: {log_path})"
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

    # context_from 注入前置作业上下文
    context_from = get_context_from(task, load_tasks())

    if action == "proactive_message":
        ok, msg = run_proactive_message(params.get("context", name), inspiration=inspiration)
        if context_from:
            msg = f"【前置上下文】{context_from[:500]}\n\n{msg}"
        save_cron_output(task_id, msg)
        deliver = deliver_message(msg, task)
        if deliver == "silent":
            ok = True
            msg = "[SILENT] 已抑制"
        if params.get("daily_report_script"):
            script = params.get("daily_report_script")
            print(f"[EXEC] Also generating daily report: {script}")
            ok2, msg2 = run_script(script, background=False)
            msg += f" | Daily report: {msg2}"
    elif action == "llm_task":
        ok, msg = execute_llm_task(task, task_type)
    elif action == "run_script":
        ok, msg = run_script(params.get("script"), background=params.get("background", True))
        save_cron_output(task_id, msg)
    elif action == "append_to_file":
        content = params.get("content", f"{name} triggered")
        if params.get("prefix"):
            content = params.get("prefix").replace("{timestamp}", now_beijing().isoformat()) + content
        if context_from:
            content = f"{context_from}\n\n{content}"
        ok, msg = append_to_file(params.get("file"), content)
        save_cron_output(task_id, content)
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
    if days == "monthly" and now.day != 1:
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
                print(f"[SKIP] {task_id}: 用户最近2小时无活动")
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
    # wakeAgent 门控
    if not run_pre_check(anchor):
        record_history(tasks, task_id, "gated", "pre_check_denied")
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
            try:
                last_ts = datetime.fromisoformat(task_history[-1]["timestamp"])
                hours_since = (now - last_ts).total_seconds() / 3600
                if hours_since < cooldown_hours:
                    return False
            except (ValueError, TypeError):
                pass
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
        # wakeAgent 门控
        if not run_pre_check(dynamic):
            record_history(tasks, task_id, "gated", "pre_check_denied")
            return False
        last = get_last_interaction_time()
        minutes_since = 9999
        if last:
            minutes_since = (now - last.astimezone(timezone(timedelta(hours=8)))).total_seconds() / 60
        today_count = len(get_history_for_task(history, task_id))
        recent_context = get_recent_context()
        should_trigger, reason, inspiration = llm_decide_think_of_doudou(minutes_since, today_count, recent_context)
        dynamic["_inspiration"] = inspiration
        if not should_trigger:
            print(f"[SKIP] {task_id}: Agent决定现在不想打扰用户 ({reason[:60]}...)")
            return False
        print(f"[DECIDE] {task_id}: Agent想用户了！({reason[:60]}...)")
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
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                content = f.read()
        else:
            content = ""
        now_str = now_beijing().strftime("%Y-%m-%d %H:%M")
        marker = "**Last Heartbeat**:"
        new_line = f"{marker} {now_str}"
        if marker in content:
            content = re.sub(re.escape(marker) + r".*", new_line, content)
        else:
            content += f"\n{new_line}\n"
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        print(f"[WARN] Failed to update SESSION-STATE: {e}", file=sys.stderr)

def main():
    lock_fd = acquire_lock()
    if lock_fd is None:
        return
    try:
        _main()
    finally:
        release_lock(lock_fd)

def _main():
    now = now_beijing()
    print(f"\n=== Heartbeat Runner v2 | {now.strftime('%Y-%m-%d %H:%M')} ===")

    # 0. 每次心跳先同步对话 + 重建索引
    try:
        sync_script = os.path.join(PROJECT_DIR, "scripts", "memory_sync_and_index.py")
        if os.path.exists(sync_script):
            subprocess.run([sys.executable, sync_script], timeout=120, cwd=PROJECT_DIR)
    except Exception as e:
        print(f"[WARN] 记忆同步失败: {e}")

    tasks = load_tasks()
    executed = []

    for anchor in tasks.get("anchors", []):
        if anchor.get("enabled") is False:
            continue
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
