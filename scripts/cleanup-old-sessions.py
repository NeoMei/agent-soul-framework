#!/usr/bin/env python3
"""
清理 OpenCode 旧会话
防止 session 无限堆积导致内存泄漏
默认保留 7 天内的会话
"""

import json
import sys
import time
import os
import base64
from datetime import datetime, timezone, timedelta

OPENCODE_URL = "http://localhost:19876"
KEEP_DAYS = 7


def _get_password():
    pwd = os.environ.get("OPENCODE_SERVER_PASSWORD", "")
    if pwd:
        return pwd
    try:
        env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                for line in f:
                    if line.startswith("OPENCODE_SERVER_PASSWORD="):
                        val = line.split("=", 1)[1].strip()
                        if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
                            val = val[1:-1]
                        return val
    except Exception:
        pass
    return ""


def _make_auth_header():
    pwd = _get_password()
    if pwd:
        token = base64.b64encode(f"opencode:{pwd}".encode()).decode()
        return {"Authorization": f"Basic {token}"}
    return {}

def main():
    try:
        import urllib.request

        # 获取所有 sessions
        headers = _make_auth_header()
        req = urllib.request.Request(f"{OPENCODE_URL}/session", headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            sessions = json.loads(resp.read().decode())

        if not sessions:
            print("[OK] 没有需要清理的会话")
            return

        now_ms = int(time.time() * 1000)
        cutoff_ms = now_ms - (KEEP_DAYS * 24 * 3600 * 1000)

        old_sessions = []
        for s in sessions:
            created = s.get("time", {}).get("created", now_ms)
            if created < cutoff_ms:
                old_sessions.append(s)

        if not old_sessions:
            print(f"[OK] 所有 {len(sessions)} 个会话都在 {KEEP_DAYS} 天内")
            return

        print(f"[CLEANUP] 发现 {len(old_sessions)} 个超过 {KEEP_DAYS} 天的旧会话（总共 {len(sessions)} 个）")

        deleted = 0
        failed = 0
        for s in old_sessions:
            sid = s["id"]
            try:
                del_headers = _make_auth_header()
                del_req = urllib.request.Request(
                    f"{OPENCODE_URL}/session/{sid}",
                    headers=del_headers,
                    method="DELETE"
                )
                with urllib.request.urlopen(del_req, timeout=10) as resp:
                    result = resp.read().decode()
                    if result.strip().lower() == "true":
                        deleted += 1
                    else:
                        failed += 1
            except Exception as e:
                failed += 1
                print(f"[WARN] 删除会话 {sid[:20]}... 失败: {e}")

        print(f"[DONE] 清理完成: 删除 {deleted} 个, 失败 {failed} 个")

    except Exception as e:
        print(f"[FAIL] 清理脚本执行失败: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
