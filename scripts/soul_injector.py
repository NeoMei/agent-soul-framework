#!/usr/bin/env python3
"""
Soul Injector - 魂器灵魂注入器
在启动 OpenCode 前注入点点的灵魂
"""

import os
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
SOUL_DIR = PROJECT_DIR / "soul"

def load_soul():
    """加载灵魂文件"""
    soul_content = []
    
    # 按顺序加载灵魂文件
    soul_files = [
        "IDENTITY.md",
        "SOUL.md",
        "USER.md",
        "AGENTS.md"
    ]
    
    for filename in soul_files:
        filepath = SOUL_DIR / filename
        if filepath.exists():
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
                soul_content.append(f"\n=== {filename} ===\n")
                soul_content.append(content)
    
    return "\n".join(soul_content)

def inject_soul():
    """注入灵魂到环境变量并写入 prompt.md"""
    soul_text = load_soul()

    # 设置环境变量，让 OpenCode 可以读取
    os.environ["OPENCODE_SYSTEM_PROMPT"] = soul_text

    # 写入 .opencode/prompt.md，供 hunqi.sh stdin 注入使用
    prompt_path = PROJECT_DIR / ".opencode" / "prompt.md"
    prompt_path.write_text(soul_text, encoding="utf-8")

    print("[OK] 灵魂注入完成")
    print(f"[INFO] 加载了 {len(soul_text)} 字符的灵魂内容")
    print(f"[INFO] 已写入 {prompt_path}")

    return soul_text

if __name__ == "__main__":
    inject_soul()
    
    # 继续启动 OpenCode
    import subprocess
    
    # 获取传递给脚本的参数
    args = sys.argv[1:] if len(sys.argv) > 1 else ["."]
    
    # 启动 OpenCode
    cmd = ["opencode"] + args
    subprocess.run(cmd)
