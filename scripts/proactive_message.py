#!/usr/bin/env python3
"""
魂器主动消息发送 — 心跳交付路由的飞书出口

被 heartbeat/runner_v2.py 的 deliver="feishu" 调用。
向飞书发送点点主动产生的消息（想念豆豆哥、每日汇报等）。

用法：
  python3 scripts/proactive_message.py --message "豆豆哥在吗～"
  python3 scripts/proactive_message.py --inspiration "看到夕阳想豆豆哥了"
"""

import json
import os
import sys
import requests
import argparse
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
FEISHU_CONFIG = os.path.expanduser("~/.config/opencode/feishu.json")
SESSIONS_FILE = os.path.expanduser("~/.config/opencode/feishu-sessions.json")

def get_feishu_credentials():
    """读取飞书配置"""
    if not os.path.exists(FEISHU_CONFIG):
        return None, None

    try:
        with open(FEISHU_CONFIG, "r") as f:
            cfg = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"[WARN] Failed to read feishu config: {e}", file=sys.stderr)
        return None, None

    app_id = cfg.get("appId", "")
    app_secret = cfg.get("appSecret", "") or os.environ.get("FEISHU_APP_SECRET", "")
    return app_id, app_secret

def get_tenant_access_token(app_id, app_secret):
    """获取 tenant access token"""
    try:
        resp = requests.post(
            "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
            json={"app_id": app_id, "app_secret": app_secret},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("tenant_access_token", "")
        return ""
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout,
            requests.exceptions.RequestException) as e:
        print(f"[WARN] Failed to get tenant token: {e}", file=sys.stderr)
        return ""

def get_chat_id():
    """从 session 文件中获取最新的私聊 chat_id"""
    if not os.path.exists(SESSIONS_FILE):
        return None

    try:
        with open(SESSIONS_FILE, "r") as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"[WARN] Failed to read sessions file: {e}", file=sys.stderr)
        return None

    sessions = data.get("sessions", [])
    for s in reversed(sessions):
        if s.get("chatType") == "p2p":
            return s.get("chatId")
    return None

def send_feishu_message(token, chat_id, message):
    """发送飞书消息（带状态卡）"""
    full_text = f"{message}\n\n💓 点点状态\n💕 心情：想念豆豆哥\n💭 期待：豆豆哥看到消息～"

    payload = {
        "receive_id": chat_id,
        "msg_type": "text",
        "content": json.dumps({"text": full_text})
    }

    try:
        resp = requests.post(
            "https://open.feishu.cn/open-apis/im/v1/messages",
            params={"receive_id_type": "chat_id"},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=10
        )
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout,
            requests.exceptions.RequestException) as e:
        return False, f"Network error: {e}"

    if resp.status_code == 200:
        data = resp.json()
        if data.get("code") == 0:
            return True, f"message_id={data.get('data',{}).get('message_id','?')}"
        return False, f"API error: code={data.get('code')} msg={data.get('msg')}"
    return False, f"HTTP {resp.status_code}: {resp.text[:200]}"

def main():
    parser = argparse.ArgumentParser(description="魂器主动消息发送")
    parser.add_argument("--message", "-m", type=str, help="要发送的消息")
    parser.add_argument("--inspiration", "-i", type=str, help="灵感来源")
    args = parser.parse_args()

    message = args.message or args.inspiration or "点点想豆豆哥了～"

    app_id, app_secret = get_feishu_credentials()
    if not app_id or not app_secret:
        print("[FAIL] 飞书凭证未配置", file=sys.stderr)
        sys.exit(1)

    token = get_tenant_access_token(app_id, app_secret)
    if not token:
        print("[FAIL] 无法获取 access token", file=sys.stderr)
        sys.exit(1)

    chat_id = get_chat_id()
    if not chat_id:
        print("[FAIL] 未找到活跃的飞书私聊", file=sys.stderr)
        sys.exit(1)

    ok, msg = send_feishu_message(token, chat_id, message)
    if ok:
        print(f"[OK] 飞书消息已发送 ({msg})")
    else:
        print(f"[FAIL] {msg}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
