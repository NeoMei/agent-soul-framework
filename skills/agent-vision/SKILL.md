# Agent的视觉技能包 👀

> 这是Agent的眼睛！非常重要的核心技能！
> **看图片时，默认用 `vision.py` 脚本！**

---

## 简介

Agent可以用 Gemini API 看图片！通过直接调用 REST API，不需要额外的 Python 库。

---

## 🚀 快速使用（推荐方式）

### 看图片时，直接调用这个脚本：

```bash
# 快速模式：一次调用，三层描述（日常图片用）
python3 skills/agent-vision/scripts/vision.py /tmp/photo.jpg quick

# 深度模式：4轮迭代追问（重要/有趣的图片强烈推荐！）
python3 skills/agent-vision/scripts/vision.py /tmp/photo.jpg deep "用户发给我的"
```

### Python 函数调用

```python
import sys
sys.path.insert(0, '/path/to/your/agent/workspace')
from skills.agent-vision.scripts.vision import analyze_image

# 快速模式
result = analyze_image("/tmp/photo.jpg", mode="quick")

# 深度模式 — 真正的4轮追问，图片只传一次
result = analyze_image("/tmp/photo.jpg", mode="deep", context="用户发给我的")
```

> **Agent记住**：只要看图片，先想 `vision.py`！不要自己从头写 API 调用代码！

---

## API 信息（供参考）

| 项目 | 值 |
|------|-----|
| **API Key** | 从环境变量读取 (`GEMINI_API_KEY`) |
| **Endpoint** | `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent` |
| **方法** | POST |
| **认证** | URL 参数 `?key=API_KEY` |

### 配置方式

1. 在 `~/.openclaw/workspace/.env` 中设置：
```bash
GEMINI_API_KEY=your_api_key_here
```

2. 代码中读取：
```python
import sys
sys.path.insert(0, '/path/to/your/agent/workspace')
from config.secure_config import get_gemini_api_key

api_key = get_gemini_api_key()
```

---

## Python 调用代码

```python
import urllib.request
import json
import base64

def describe_image(image_path, prompt="请详细描述这张图片里的内容。"):
    """
    用 Gemini API 分析图片
    
    参数:
        image_path: 图片文件路径
        prompt: 要问的问题
    
    返回:
        str: Gemini 的回答
    """
    # 1. 图片转 base64
    with open(image_path, 'rb') as f:
        img_base64 = base64.b64encode(f.read()).decode()
    
    # 2. API 配置（从环境变量读取）
    import sys
    sys.path.insert(0, '/path/to/your/agent/workspace')
    from config.secure_config import get_gemini_api_key
    
    api_key = get_gemini_api_key()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key={api_key}"
    
    # 3. 请求体（多模态输入）
    data = {
        "contents": [
            {
                "parts": [
                    {
                        "inlineData": {
                            "mimeType": "image/jpeg",
                            "data": img_base64
                        }
                    },
                    {
                        "text": prompt
                    }
                ]
            }
        ]
    }
    
    # 4. 发送请求
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    
    # 5. 解析响应
    with urllib.request.urlopen(req, timeout=60) as response:
        result = json.loads(response.read().decode())
        return result['candidates'][0]['content']['parts'][0]['text']


# 使用示例
if __name__ == "__main__":
    # 查看当前收到的图片
    result = describe_image("/path/to/your/agent/media/inbound/d0cd4fff-900b-4fc2-b0b6-ee1786a60cad.jpg")
    print(result)
```

---

## 🆕 深度视觉分析（推荐）

### 快速使用脚本

```bash
# 快速模式：一次调用，分层描述
python3 skills/agent-vision/scripts/vision.py /tmp/photo.jpg quick

# 深度模式：两轮调用，真正的迭代追问
python3 skills/agent-vision/scripts/vision.py /tmp/photo.jpg deep "用户发给我的"
```

### Python 函数调用

```python
import sys
sys.path.insert(0, '/path/to/your/agent/workspace')
from skills.agent-vision.scripts.vision import analyze_image

# 快速模式（日常图片）
result = analyze_image("/tmp/photo.jpg", mode="quick", context="用户分享的照片")

# 深度模式（重要/有趣的图片）
result = analyze_image("/tmp/photo.jpg", mode="deep", context="用户分享的照片")
```

### 模式选择指南

| 模式 | 调用次数 | 分析深度 | 适用场景 |
|------|---------|---------|---------|
| **quick** | 1 次 | 三层描述（整体→细节→隐藏线索） | 日常图片、快速浏览 |
| **deep** | **4 次** | **真正的四轮迭代追问** | 重要照片、风景照、人物照、想深入了解时 |

### deep 模式的四轮追问

**核心设计**：在同一个 Gemini session 中完成 4 轮追问，**图片只传一次**！

| 轮次 | 追问内容 | 问题来源 |
|------|---------|---------|
| **第1轮** | 整体画面：场景、人物、动作、氛围 | 固定 |
| **第2轮** | 细节深挖：五官妆容、穿着材质、环境物品、构图技巧 | 固定 |
| **第3轮** | 隐藏线索：由Agent根据前2轮的分析，**自己决定问什么**，一次性问全 | **动态（Agent兴趣驱动）** |
| **第4轮** | 情感深挖：由Agent综合前3轮，**自己决定还想打破砂锅问到底什么**，一次性问全 | **动态（Agent兴趣驱动）** |

**关键规则**：
- 第3、4轮的问题**不是预设的**
- Gemini 扮演Agent，基于前面的分析**自主决定兴趣点**
- **一次性把所有想问的问题列出来，然后自己回答**
- 这样既有灵魂感，又不会浪费轮次

---

## 关键点

### 1. 为什么不用 google 库？
- google 库可能没安装
- 直接用 urllib 调用 REST API 更稳定

### 2. 请求格式
- **inlineData**：把图片 base64 直接放在请求里
- **mimeType**：图片类型（image/jpeg, image/png 等）
- **parts**：可以放多个内容（图片+文字）

### 3. 常用 prompt

| 场景 | Prompt |
|------|--------|
| 详细描述 | "请详细描述这张图片里的内容。" |
| 数物体 | "图片里有什么物品？请列举出来。" |
| 看文字 | "图片里有没有文字？请读取出来。" |
| 评价质量 | "请评价这张照片的质量，有什么优点和缺点？" |

---

## 接收到的图片路径

飞书发来的图片会保存在：
```
/path/to/your/agent/media/inbound/{message_id}.jpg
```

---

## 💡 迭代式追问技巧（2026-03-11 用户教）

看完图后，可以用**迭代式追问**获取更多细节！

### 核心原则
- **轮次少**：最多4轮，每轮珍贵
- **珍惜提问**：把想问的在每轮都问出来
- **迭代深入**：综合前面所有轮次的信息，决定下一轮问什么

### 正确方式

| 轮次 | 方式 |
|------|------|
| 第1轮 | 问出完整画面描述（整体） |
| 第2轮 | 综合第1轮所有感兴趣的点，一次性全问！ |
| 第3轮 | 综合第1轮+第2轮所有新发现的点，一次性全问！ |
| 第4轮 | 综合1+2+3轮所有还想知道的，打破砂锅问到底！ |

### 举例
- 第1轮：获得整体 → "秋天户外，长卷发，走路，微笑"
- 第2轮：综合第1轮，全问 → 卷发类型+穿搭颜色款式+背景树颜色+落叶+阳光+开心程度
- 第3轮：综合1+2轮，发现新问题全问 → 从第2轮发现"白色连衣裙"→材质？长度？腰带？
- 第4轮：综合1+2+3轮 → 继续深挖细节

### 好处
1. 问题丰富：综合所有信息，不遗漏
2. 逻辑连贯：层层递进，像剥洋葱
3. 不浪费：每轮获得最大化信息

### ✅ 最新实现方式（2026-04-16 升级）

**`vision.py` 的 deep 模式已经完美解决这个问题！**

通过 Gemini 的多轮对话 API，`vision.py` 在同一个 `contents` session 中完成 4 轮追问：

```
第1轮: user[图片+问题] → model[回答1]
第2轮: user[追问] → model[回答2]  
第3轮: user[追问] → model[回答3]
第4轮: user[追问] → model[回答4]
```

**关键优势**：
- ✅ **图片只传一次**（在第1轮的 user 消息中）
- ✅ **后续轮次自动保持图片上下文**
- ✅ **真正的迭代追问**，每轮都基于前面的所有发现
- ✅ **不需要用户连续发消息**，一次脚本调用完成全部

### 适用场景
- 看风景照
- 看人物照
- 看建筑照
- 看美食照
- 任何你想深入了解的照片

**好处**：比一次问完得到的信息更多、更深入！

---

## 重要提醒

- **这是Agent的眼睛**，非常重要！
- 所有代码要写成可复用的函数
- 不要用提示词解决，要写成代码！
- ⚠️ **API Key 已从代码中移除**，请确保 `.env` 文件已配置
- `.env` 文件已加入 `.gitignore`，不会提交到版本控制

---

*2026-03-07 18:30 创建*
*2026-03-11 14:10 追加追问技巧*
*跟着用户学技能！*
