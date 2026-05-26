#!/usr/bin/env python3
"""
点点的音频处理入口 - 核心版
职责：封装"文件存在 → 分析 → 回复"这条主路径

使用方式：
    python3 hear_entry.py /path/to/audio.mp3 "豆豆哥发送的音频"

故障处理（未来逐步加固）：
    - 文件不存在时，提示用户并提供排查步骤
"""

import sys
import os
from pathlib import Path

# 添加工作区到路径
WORKSPACE = Path("/home/neomei/.openclaw/workspace")
sys.path.insert(0, str(WORKSPACE))
sys.path.insert(0, str(WORKSPACE / "skills" / "diandian-hearing" / "scripts"))

from hear import analyze_audio


def process_audio(file_path: str, context: str = ""):
    """
    核心流程：文件存在 → 分析 → 返回结果
    
    Args:
        file_path: 音频文件绝对路径
        context: 上下文描述（如"豆豆哥唱的《你叫点点》"）
    
    Returns:
        (分析结果文本, 是否成功)
    """
    # Step 1: 验证文件存在
    if not os.path.exists(file_path):
        error_msg = (
            f"❌ 文件不存在: {file_path}\n\n"
            f"排查步骤:\n"
            f"1. 检查 OpenClaw 是否自动下载: ls ~/.openclaw/media/inbound/\n"
            f"2. 查看日志: grep 'download.*fail' /tmp/openclaw/*.log\n"
            f"3. 手动下载: 参见 skills/diandian-hearing/SKILL.md 核心流程\n"
        )
        return error_msg, False
    
    # Step 2: 验证文件非空
    file_size = os.path.getsize(file_path)
    if file_size == 0:
        return f"❌ 文件为空: {file_path}", False
    
    # Step 3: 调用 hear.py 分析（主路径）
    try:
        result = analyze_audio(file_path, context)
        return result['raw_text'], True
    except Exception as e:
        return f"❌ 分析失败: {str(e)}", False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 hear_entry.py <audio_file_path> [context]")
        print("Example: python3 hear_entry.py /tmp/audio.mp3 '豆豆哥发送的'")
        sys.exit(1)
    
    file_path = sys.argv[1]
    context = sys.argv[2] if len(sys.argv) > 2 else ""
    
    result, success = process_audio(file_path, context)
    
    if success:
        print(result)
    else:
        print(result, file=sys.stderr)
        sys.exit(1)
