---
name: diandian-slide-deck
description: 用即梦API生成PPT幻灯片图片。支持多种视觉风格（sketch-notes、chalkboard、blueprint等），基于baoyu提示词模板。当用户要求创建PPT、幻灯片、演示文稿时使用。
version: 1.0.0
metadata:
  openclaw:
    homepage: local
    requires:
      anyBins:
        - bun
---

# 点点的PPT生成器 🎨

基于 baoyu-slide-deck 提示词模板 + 即梦API 生成专业幻灯片图片。

## 功能

- 📝 从Markdown内容生成PPT大纲
- 🎨 支持多种视觉风格
- 🖼️ 调用即梦API生成高质量图片
- 📊 自动统计和规划幻灯片数量

## 风格

| 风格 | 说明 | 适用场景 |
|------|------|----------|
| **sketch-notes** | 手绘笔记风格，暖白色背景，彩色手写字体 | 教育、知识分享、教程 |
| **chalkboard** | 粉笔风格，深绿色黑板，木质边框 | 教育、课堂教学 |
| **blueprint** | 蓝图风格，网格背景，科技蓝调 | 架构设计、技术文档 |
| **corporate** | 企业风格，商务简约 | 商业演示、投资人演示 |
| **minimal** | 极简风格，大量留白 | 高管演示、简洁汇报 |
| **watercolor** | 水彩风格，柔和温暖 | 生活、内容创作 |
| **dark-atmospheric** | 暗色调，戏剧性 | 娱乐、游戏演示 |
| **notion** | Notion风格，信息密集 | 产品演示、SaaS |

## 使用方法

### 命令行

```bash
# 基本用法
bun run skills/diandian-slide-deck/scripts/main.ts content.md

# 指定风格和数量
bun run skills/diandian-slide-deck/scripts/main.ts content.md --style sketch-notes --slides 8
```

### 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--style <风格>` | 视觉风格 | sketch-notes |
| `--slides <数量>` | 幻灯片数量 | 自动计算 |
| `--lang <语言>` | 语言 | zh |
| `--output <目录>` | 输出目录 | slide-deck/<主题> |

## 输出

生成的文件结构：

```
slide-deck/<主题>/
├── source-<主题>.md    # 源文件
├── outline.md          # 大纲
├── prompts/            # 提示词
│   ├── 01-slide-xxx.md
│   └── ...
└── images/             # 生成的图片
    ├── 01-slide-xxx.jpg
    └── ...
```

## 示例

**输入 (content.md):**
```markdown
# 人工智能入门

## 什么是AI
人工智能是...

## 机器学习
机器学习是...

## 深度学习
深度学习是...
```

**生成命令:**
```bash
bun run skills/diandian-slide-deck/scripts/main.ts content.md --style sketch-notes --slides 5
```

## 依赖

- bun 运行时
- 即梦API (doubao-seedream-5-0-260128)
