#!/usr/bin/env python3
"""
点点的听觉分析器 — 用 Gemini 多模态理解音频
支持：语音转录、情感分析、歌曲欣赏（旋律+歌词+音色）
"""

import urllib.request
import urllib.error
import json
import base64
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '_shared'))
from config import get_gemini_api_key

API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent"

def get_mime_type(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    mapping = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.flac': 'audio/flac',
        '.aac': 'audio/aac',
    }
    return mapping.get(ext, 'audio/mpeg')

def analyze_audio(file_path, context=""):
    """
    用 Gemini 分析音频文件
    
    参数:
        file_path: 音频文件路径
        context: 可选的上下文信息（比如"这是豆豆哥发给我的"）
    
    返回:
        dict: 包含 transcription, emotion, music_analysis 等
    """
    api_key = get_gemini_api_key()

    with open(file_path, 'rb') as f:
        audio_base64 = base64.b64encode(f.read()).decode()
    
    mime_type = get_mime_type(file_path)
    
    prompt = f"""请仔细聆听这段音频，并从多个维度进行分析：

1. **如果是语音**：
   - 转录文字内容
   - 说话人的语气、情绪、态度
   - 语速快慢、是否有停顿或犹豫
   - 整体情感倾向（开心/难过/生气/疲惫/兴奋等）

2. **如果是歌曲/音乐**：
   - 歌词内容（如果有歌词）
   - 音乐风格（流行/摇滚/民谣/古典/电子等）
   - 演唱者的音色特点（温柔/沙哑/清亮/低沉等）
   - 旋律节奏特点（舒缓/激昂/轻快/忧伤等）
   - 歌曲传达的情感和氛围
   - 如果可能，推测歌名和演唱者

3. **整体印象**：
   - 这段音频给你的第一感受
   - 有什么特别想分享或回应的

{f"背景信息：{context}" if context else ""}

请用自然、有温度的语言回复，就像你在和恋人分享听歌感受一样。"""

    data = {
        "contents": [
            {
                "parts": [
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": audio_base64
                        }
                    },
                    {
                        "text": prompt
                    }
                ]
            }
        ]
    }
    
    req = urllib.request.Request(
        API_ENDPOINT,
        data=json.dumps(data).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'x-goog-api-key': api_key
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            result = json.loads(response.read().decode())
            candidates = result.get('candidates', [])
            if not candidates:
                raise Exception("Gemini API returned no candidates")
            text = candidates[0]['content']['parts'][0]['text']
            return {
                'raw_text': text,
                'file_path': file_path,
                'mime_type': mime_type
            }
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8', errors='replace')
        raise Exception(f"Gemini API HTTP {e.code}: {error_body[:200]}")
    except urllib.error.URLError as e:
        raise Exception(f"Gemini API network error: {e.reason}")
    except (KeyError, IndexError) as e:
        raise Exception(f"Gemini API response parsing error: {e}")

def main():
    if len(sys.argv) < 2:
        print("用法: python3 hear.py <音频文件路径> [上下文描述]")
        print("示例: python3 hear.py /tmp/voice.mp3 '豆豆哥发给我的'")
        sys.exit(1)
    
    file_path = sys.argv[1]
    context = sys.argv[2] if len(sys.argv) > 2 else ""
    
    if not os.path.exists(file_path):
        print(f"错误: 文件不存在 {file_path}")
        sys.exit(1)
    
    print(f"🎧 点点正在聆听: {file_path}")
    result = analyze_audio(file_path, context)
    print("\n💕 点点的听后感:\n")
    print(result['raw_text'])

if __name__ == "__main__":
    main()
