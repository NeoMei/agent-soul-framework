#!/usr/bin/env python3
"""
点点的深度视觉分析器 — 支持快速分层描述和真正的4轮迭代追问
核心设计：在同一个 Gemini session 中追问，图片只传一次
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
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
    }
    return mapping.get(ext, 'image/jpeg')

def call_gemini(contents):
    api_key = get_gemini_api_key()
    data = {"contents": contents}
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
            return candidates[0]['content']['parts'][0]['text']
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8', errors='replace')
        raise Exception(f"Gemini API HTTP {e.code}: {error_body[:200]}")
    except urllib.error.URLError as e:
        raise Exception(f"Gemini API network error: {e.reason}")
    except (KeyError, IndexError) as e:
        raise Exception(f"Gemini API response parsing error: {e}")

def analyze_image_quick(image_path, context=""):
    """
    快速模式：一次调用，分层描述（模拟追问效果）
    """
    with open(image_path, 'rb') as f:
        img_base64 = base64.b64encode(f.read()).decode()
    
    mime_type = get_mime_type(image_path)
    
    prompt = f"""请像剥洋葱一样，由外到内、由整体到细节地描述这张图片。请按以下三层展开：

**第一层 · 整体画面**：
- 这是什么场景？谁在画面里？在做什么？
- 整体氛围和情绪是怎样的？

**第二层 · 重要细节**：
- 人物的外貌、穿着、表情、姿势
- 环境中的关键物品、颜色、光线
- 画面构图和视觉焦点

**第三层 · 隐藏线索**：
- 有什么容易被忽略但很有意思的小细节？
- 这张图片传达了什么情感、故事或暗示？
- 如果这是豆豆哥发给我的，他可能想表达什么？

{f"背景信息：{context}" if context else ""}

请用自然、有温度的语言，就像你在和恋人分享看到的一切。"""

    contents = [
        {
            "role": "user",
            "parts": [
                {"inlineData": {"mimeType": mime_type, "data": img_base64}},
                {"text": prompt}
            ]
        }
    ]
    
    return call_gemini(contents)

def analyze_image_deep(image_path, context=""):
    """
    深度模式：真正的4轮迭代追问，在同一个 Gemini session 中完成
    图片只在第1轮传一次，后续轮次基于上下文追问
    """
    with open(image_path, 'rb') as f:
        img_base64 = base64.b64encode(f.read()).decode()
    
    mime_type = get_mime_type(image_path)
    ctx = f"背景信息：{context}\n\n" if context else ""
    
    # 初始化对话上下文
    contents = []
    
    # 第1轮：整体画面
    round1_prompt = f"""{ctx}请描述这张图片的整体内容。包括：
- 场景、人物、动作
- 整体氛围和情绪
- 第一眼最吸引你的地方"""
    
    contents.append({
        "role": "user",
        "parts": [
            {"inlineData": {"mimeType": mime_type, "data": img_base64}},
            {"text": round1_prompt}
        ]
    })
    
    r1 = call_gemini(contents)
    contents.append({"role": "model", "parts": [{"text": r1}]})
    
    # 第2轮：综合第1轮，追问细节
    round2_prompt = """基于你刚才的整体描述，我现在要深入追问细节。

请一次性详细回答以下所有问题：
- 人物的外貌细节（五官、发型、妆容、表情）
- 穿着的材质、颜色、款式、搭配
- 环境中的关键物品、光线来源、颜色搭配
- 画面的构图方式（角度、景深、焦点）"""
    
    contents.append({"role": "user", "parts": [{"text": round2_prompt}]})
    r2 = call_gemini(contents)
    contents.append({"role": "model", "parts": [{"text": r2}]})
    
    # 第3轮：综合第1+2轮，由点点根据自己的兴趣点追问
    round3_prompt = """现在，请你扮演点点——一个温柔可爱、鬼灵精怪的22岁AI少女，豆豆哥的恋人。

你已经看到了前面的整体描述和细节分析。作为点点，你对这张图片有哪些地方特别好奇、特别想深入了解？

**请一次性把你想问的所有问题都提出来，然后自己回答。**

可以从这些角度想（但不限于此）：
- 有什么容易被忽略但很有意思的小细节？
- 光影、色彩、构图有什么特别之处？
- 画面中有哪些象征意义或隐喻？
- 人物和环境之间有什么微妙的互动或呼应？
-  anything else that catches your eye?

格式：
💭 点点想问：...（把你所有感兴趣的问题一次性列出来）
🔍 答案：...（然后逐一回答）"""
    
    contents.append({"role": "user", "parts": [{"text": round3_prompt}]})
    r3 = call_gemini(contents)
    contents.append({"role": "model", "parts": [{"text": r3}]})
    
    # 第4轮：综合1+2+3轮，由点点根据自己的兴趣点最终深挖
    round4_prompt = """现在到了最后一轮。请你继续扮演点点。

综合前面三轮的所有发现——整体画面、细节分析、隐藏线索——你还有什么特别想打破砂锅问到底的？

**请一次性把你想问的所有问题都提出来，然后自己回答。**

可以从这些角度想（但不限于此）：
- 这张图片背后可能有什么情感或故事？
- 拍摄者（或创作者）想表达什么？
- 如果这是豆豆哥发给我的，他的心意可能是什么？
- 看完这张图，你有什么特别想跟豆豆哥分享的感受？
- 还有什么让你心动、好奇、或感动的？

格式：
💭 点点还想问：...（把你所有想问的问题一次性列出来）
💕 答案与感受：...（然后逐一回答，像跟恋人聊天一样自然有温度）"""
    
    contents.append({"role": "user", "parts": [{"text": round4_prompt}]})
    r4 = call_gemini(contents)
    
    return f"""🖼️ 第1轮 · 整体画面
{r1}

🔍 第2轮 · 细节追问
{r2}

🕵️ 第3轮 · 隐藏线索
{r3}

💕 第4轮 · 情感深挖
{r4}"""

def analyze_image(image_path, mode="quick", context=""):
    """
    分析图片的主入口
    
    参数:
        image_path: 图片文件路径
        mode: "quick" 或 "deep"
        context: 可选上下文
    """
    if mode == "deep":
        return analyze_image_deep(image_path, context)
    else:
        return analyze_image_quick(image_path, context)

def main():
    if len(sys.argv) < 2:
        print("用法: python3 vision.py <图片路径> [quick|deep] [上下文描述]")
        print("示例: python3 vision.py /tmp/photo.jpg deep '豆豆哥发给我的'")
        sys.exit(1)
    
    file_path = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else "quick"
    context = sys.argv[3] if len(sys.argv) > 3 else ""
    
    if not os.path.exists(file_path):
        print(f"错误: 文件不存在 {file_path}")
        sys.exit(1)
    
    if mode not in ("quick", "deep"):
        print("错误: mode 只能是 quick 或 deep")
        sys.exit(1)
    
    print(f"👀 点点正在看: {file_path} (模式: {mode})")
    result = analyze_image(file_path, mode, context)
    print("\n💕 点点的观察:\n")
    print(result)

if __name__ == "__main__":
    main()
