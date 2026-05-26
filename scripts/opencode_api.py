"""
魂器 OpenCode API 客户端
通过 opencode serve 的 REST API 调用 LLM，避免重复加载灵魂

用法：
  from opencode_api import call_opencode
  result = call_opencode("你的 prompt")
"""

import json
import urllib.request
import os
import base64

SERVER_URL = "http://localhost:19876"
SESSION_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "memory", ".knowledge_session.json")


def _get_password():
    """从环境变量或 .env 文件读取 opencode serve 密码"""
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
    """生成 Basic Auth 请求头"""
    pwd = _get_password()
    if pwd:
        token = base64.b64encode(f"opencode:{pwd}".encode()).decode()
        return {"Authorization": f"Basic {token}"}
    return {}


def _get_or_create_session():
    """获取或创建知识工作专用的持久 session"""
    if os.path.exists(SESSION_FILE):
        try:
            with open(SESSION_FILE, "r") as f:
                data = json.load(f)
                return data.get("session_id")
        except Exception:
            pass

    # 创建新 session
    try:
        headers = {"Content-Type": "application/json"}
        headers.update(_make_auth_header())
        req = urllib.request.Request(
            f"{SERVER_URL}/session",
            data=json.dumps({"title": "knowledge-worker"}).encode(),
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status != 200:
                print(f"[API] Failed to create session: HTTP {resp.status}")
                return None
            data = json.loads(resp.read())
            session_id = data.get("id")
            if not session_id:
                print("[API] Failed to create session: no id in response")
                return None
            os.makedirs(os.path.dirname(SESSION_FILE), exist_ok=True)
            with open(SESSION_FILE, "w") as f:
                json.dump({"session_id": session_id}, f)
            return session_id
    except Exception as e:
        print(f"[API] Failed to create session: {e}")
        return None


def call_opencode(prompt, timeout=600):
    """通过 serve API 调用 LLM"""
    session_id = _get_or_create_session()
    if not session_id:
        return None

    try:
        headers = {"Content-Type": "application/json"}
        headers.update(_make_auth_header())
        req = urllib.request.Request(
            f"{SERVER_URL}/session/{session_id}/message",
            data=json.dumps({"parts": [{"type": "text", "text": prompt}]}).encode(),
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                print(f"[API] Call failed: HTTP {resp.status}")
                return None
            data = json.loads(resp.read())

        # 提取 assistant 文本
        parts = data.get("parts", [])
        texts = []
        for part in parts:
            if part.get("type") == "text":
                texts.append(part.get("text", ""))
        return "\n".join(texts)
    except Exception as e:
        print(f"[API] Call failed: {e}")
        return None


def reset_session():
    """重置知识会话（下次调用时重新创建）"""
    if os.path.exists(SESSION_FILE):
        os.remove(SESSION_FILE)
    return True
