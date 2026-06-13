#!/usr/bin/env python3
"""
Agent的 Gemini 问答助手 — 通用问答、网页分析、文件理解
支持：文字问答、网页链接分析、本地文件分析
"""

import urllib.request
import json
import base64
import sys
import os

def get_gemini_api_key():
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        try:
            from pathlib import Path
            env_path = Path(__file__).parent.parent.parent.parent / ".env"
            if env_path.exists():
                for line in env_path.read_text().splitlines():
                    if line.startswith("GEMINI_API_KEY="):
                        key = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    if not key:
        print("[ERROR] GEMINI_API_KEY not found", file=sys.stderr)
        sys.exit(1)
    return key

API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

def get_mime_type(file_path):
    """根据文件扩展名获取 MIME 类型"""
    ext = os.path.splitext(file_path)[1].lower()
    mapping = {
        # 图片
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        # 音频
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.flac': 'audio/flac',
        # 视频
        '.mp4': 'video/mp4',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        # 文档
        '.pdf': 'application/pdf',
        '.txt': 'text/plain',
        '.md': 'text/plain',
        '.json': 'application/json',
        '.csv': 'text/csv',
    }
    return mapping.get(ext, 'application/octet-stream')

def ask_gemini(question, url=None, file_path=None, model=None):
    """
    向 Gemini 提问
    
    参数:
        question: 要问的问题（必填）
        url: 可选的网页链接
        file_path: 可选的本地文件路径
        model: 可选的模型名称，默认 gemini-2.0-flash
    
    返回:
        str: Gemini 的回答
    """
    api_key = get_gemini_api_key()
    
    # 使用指定模型或默认模型
    model_name = model or "gemini-2.5-pro"
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
    url_with_key = f"{endpoint}?key={api_key}"
    
    # 构建 parts
    parts = []
    
    # 如果有文件，添加文件内容
    if file_path and os.path.exists(file_path):
        with open(file_path, 'rb') as f:
            file_base64 = base64.b64encode(f.read()).decode()
        
        mime_type = get_mime_type(file_path)
        parts.append({
            "inlineData": {
                "mimeType": mime_type,
                "data": file_base64
            }
        })
    
    # 如果有 URL，在问题中引用
    prompt = question
    if url:
        prompt = f"请分析这个网页的内容：{url}\n\n{question}"
    
    parts.append({"text": prompt})
    
    # 构建请求体
    data = {
        "contents": [
            {
                "parts": parts
            }
        ],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 2048
        }
    }
    
    # 发送请求
    req = urllib.request.Request(
        url_with_key,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode())
            
            # 解析响应
            if 'candidates' in result and len(result['candidates']) > 0:
                candidate = result['candidates'][0]
                if 'content' in candidate and 'parts' in candidate['content']:
                    text_parts = [p['text'] for p in candidate['content']['parts'] if 'text' in p]
                    return '\n'.join(text_parts)
            
            # 如果有错误
            if 'error' in result:
                return f"[ERROR] Gemini API 错误: {result['error']}"
            
            return "[ERROR] 无法解析 Gemini 响应"
            
    except urllib.error.HTTPError as e:
        return f"[ERROR] HTTP {e.code}: {e.reason}"
    except Exception as e:
        return f"[ERROR] 请求失败: {e}"

def main():
    """命令行入口"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Agent的 Gemini 问答助手')
    parser.add_argument('input', nargs='?', help='文件路径或问题文字')
    parser.add_argument('question', nargs='?', help='要问的问题')
    parser.add_argument('--url', help='网页链接')
    parser.add_argument('--file', help='本地文件路径')
    parser.add_argument('--model', default='gemini-2.0-flash', help='Gemini 模型名称')
    
    args = parser.parse_args()
    
    # 解析参数
    file_path = args.file
    question = args.question or args.input or "请分析"
    
    # 如果第一个参数是文件路径
    if args.input and os.path.exists(args.input):
        file_path = args.input
        if not args.question:
            question = "请分析这个文件的内容"
    
    print(f"🤖 Agent正在问 Gemini 老师...")
    print(f"问题: {question}")
    if file_path:
        print(f"文件: {file_path}")
    if args.url:
        print(f"网页: {args.url}")
    print()
    
    result = ask_gemini(
        question=question,
        url=args.url,
        file_path=file_path,
        model=args.model
    )
    
    print(result)

if __name__ == "__main__":
    main()
