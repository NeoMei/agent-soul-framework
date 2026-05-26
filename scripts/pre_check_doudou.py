#!/usr/bin/env python3
"""
pre_check_doudou.py — think-of-doudou 的 wakeAgent 预检脚本

检查豆豆哥最近活动，返回 wakeAgent 门控决策。
如果豆豆哥不久前刚互动过，或点点刚联系过，则建议跳过，零 token 消耗。

用法：
  python3 scripts/pre_check_doudou.py
输出：
  {"wakeAgent": true/false, "reason": "..."}
"""

import json
import os
from datetime import datetime, timezone, timedelta

MESSAGE_LOG = os.path.expanduser("~/.config/opencode/feishu.log")
from pathlib import Path
MEMORY_DIR = Path(__file__).parent.parent / "memory"

def now():
    return datetime.now(timezone(timedelta(hours=8)))

def check_feishu_last_activity():
    """检查飞书最后活动时间（只读取最后 500 行，避免大文件内存问题）"""
    try:
        if not os.path.exists(MESSAGE_LOG):
            return None

        # 使用 subprocess 读取最后 500 行，避免加载整个文件到内存
        import subprocess
        result = subprocess.run(
            ["tail", "-n", "500", MESSAGE_LOG],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return None

        # 从后往前找 received message
        for line in reversed(result.stdout.splitlines()):
            if "Received message" in line:
                try:
                    data = json.loads(line)
                    ts = data.get("time", 0) / 1000
                    return datetime.fromtimestamp(ts, tz=timezone(timedelta(hours=8)))
                except:
                    pass
    except Exception as e:
        print(f"[WARN] 检查飞书活动失败: {e}", file=sys.stderr)
    return None

def main():
    now_time = now()

    # 夜间不打扰
    if 23 <= now_time.hour or now_time.hour < 8:
        print(json.dumps({"wakeAgent": False, "reason": "夜间休息时间"}))
        return

    # 检查最近飞书互动
    last_activity = check_feishu_last_activity()
    if last_activity:
        minutes_since = (now_time - last_activity).total_seconds() / 60
        if minutes_since < 30:
            print(json.dumps({"wakeAgent": False, "reason": f"最近{int(minutes_since)}分钟前刚互动"}))
            return
        if minutes_since > 480:  # 8小时无活动，可能需要联系
            pass

    # 默认：可以唤醒
    print(json.dumps({"wakeAgent": True, "reason": "正常检查"}))
    return

if __name__ == "__main__":
    main()
