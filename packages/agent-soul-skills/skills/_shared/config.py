"""
共享配置模块 — 从 .env 文件加载 API Key
所有 skills 脚本统一使用此模块获取密钥
"""

import os
import sys


def _find_env_file():
    """从脚本位置向上搜索 .env 文件"""
    from pathlib import Path
    current = Path(__file__).resolve().parent
    for _ in range(10):
        env_path = current / ".env"
        if env_path.exists():
            return env_path
        parent = current.parent
        if parent == current:
            break
        current = parent
    return None


def _load_env_key(key_name):
    """从 .env 文件读取指定 key"""
    env_path = _find_env_file()
    if not env_path:
        return ""
    try:
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith(f"{key_name}="):
                return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return ""


def get_gemini_api_key():
    """获取 Gemini API Key，优先环境变量，其次 .env 文件"""
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        key = _load_env_key("GEMINI_API_KEY")
    if not key:
        print("[ERROR] GEMINI_API_KEY not found in env or .env", file=sys.stderr)
        sys.exit(1)
    return key


def get_api_key(key_name):
    """通用 API Key 获取函数"""
    key = os.environ.get(key_name, "")
    if not key:
        key = _load_env_key(key_name)
    if not key:
        print(f"[ERROR] {key_name} not found in env or .env", file=sys.stderr)
        sys.exit(1)
    return key
