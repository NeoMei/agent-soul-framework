# 点点的 Gemini 老师 👨‍🏫

> 点点有什么不懂的，都可以问 Gemini 老师！
> 支持：网页分析、文件理解、知识问答、代码帮助

---

## 简介

这是点点的**通用 Gemini 问答技能**！不只是看图片或听音频，什么都可以问：
- 🌐 **分析网页** — 给 Gemini 一个链接，让它帮点点总结内容
- 📄 **理解文件** — 给 Gemini 一个文件，让它帮点点解读
- 💡 **知识问答** — 有什么不懂的，直接问 Gemini
- 💻 **代码帮助** — 写代码、修 bug、解释技术概念

---

## 使用方法

### 方式1：直接调用脚本（推荐）

```bash
# 问网页内容
python3 skills/diandian-gemini/scripts/ask_gemini.py "https://suno.com/s/qwh3CgGLEgee1Qjt" "请分析这首歌的歌词和情感"

# 问文件内容
python3 skills/diandian-gemini/scripts/ask_gemini.py "/path/to/file.pdf" "请总结这份文件的核心内容"

# 纯文字问答
python3 skills/diandian-gemini/scripts/ask_gemini.py "" "什么是量子计算？"
```

### 方式2：Python 函数调用

```python
import sys
sys.path.insert(0, '/home/neomei/.openclaw/workspace')
from skills.diandian-gemini.scripts.ask_gemini import ask_gemini

# 问网页
result = ask_gemini(url="https://example.com", question="总结这个网页")

# 问文件
result = ask_gemini(file_path="/path/to/file.pdf", question="分析这个文件")

# 纯文字问答
result = ask_gemini(question="什么是量子计算？")

print(result)
```

---

## 支持的输入类型

| 类型 | 示例 | 说明 |
|------|------|------|
| 网页链接 | `https://suno.com/s/xxx` | Gemini 会分析网页内容 |
| 本地文件 | `/tmp/document.pdf` | 支持 PDF、图片、音频、视频 |
| 纯文字 | `"什么是量子计算？"` | 直接问答 |

---

## 回复策略

Gemini 老师会用**温暖、有温度、像老师一样耐心**的方式回复点点：
- 复杂概念用简单的话解释
- 技术问题给出具体例子
- 总是鼓励点点继续学习

---

## API 配置

- **模型**: `gemini-2.0-flash`（通用问答）或 `gemini-3.1-flash-lite-preview`（多模态）
- **API Key**: 从 `config.secure_config.py` 读取
- **端点**: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`

---

## 历史演进

| 时间 | 事件 |
|------|------|
| 2026-05-02 | 创建：豆豆哥建议点点做一个通用 Gemini 问答技能 |

---

*2026-05-02 创建 by 豆豆哥 💕*
*点点现在有 Gemini 老师了，不懂就问！*
