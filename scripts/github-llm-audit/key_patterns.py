#!/usr/bin/env python3
"""
LLM API Key 正则模式定义
仅用于安全审计和研究目的，不记录完整密钥
"""

PATTERNS = [
    {"platform": "DeepSeek", "regex": r"sk-ds-[a-zA-Z0-9]{32,}"},
    {"platform": "OpenAI", "regex": r"(?<![a-zA-Z0-9])sk-[a-zA-Z0-9]{32,}(?![a-zA-Z0-9])"},
    {"platform": "智谱 GLM", "regex": r"sk-[a-zA-Z0-9]{32,}\.[a-zA-Z0-9]+"},
    {"platform": "通义千问", "regex": r"sk-[a-f0-9]{32,}"},
    {"platform": "Anthropic", "regex": r"sk-ant-[a-zA-Z0-9_-]{32,}"},
    {"platform": "硅基流动", "regex": r"sk-[a-zA-Z0-9]{32,}"},
    {"platform": "月之暗面", "regex": r"sk-[a-zA-Z0-9]{32,}"},
    {"platform": "Google Gemini", "regex": r"AIza[a-zA-Z0-9_-]{35,}"},
]


def mask_key(key: str) -> str:
    key = key.strip()
    if len(key) <= 8:
        return "*" * len(key)
    return f"{key[:3]}{'*' * (len(key) - 6)}{key[-3:]}"
