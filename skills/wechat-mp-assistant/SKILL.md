---
name: wechat-mp-assistant
description: |
  微信公众号文章全流程助手 - 从选题、撰写、润色到发布一站式解决。
  合并了 wechat-mp-writer 和 wechat-publisher 的功能。
---

# 微信公众号文章全流程助手

**写作 + 润色 + 配图 + 发布 = 一站式解决**

---

## 🚨 绝对禁止（2026-04-19 豆豆哥确立）

| ❌ 禁止 | 原因 |
|--------|------|
| **不读此 SKILL.md 就写公众号** | 必须确认最新流程和凭证配置 |
| **封面图不用点点形象** | 必须用即梦AI生成，保持人格一致性 |
| **正文不配插图** | 每2-3段必须有一张点点形象配图 |
| **使用默认封面或网图** | 必须用点点形象，不能偷懒 |
| **文章没有 frontmatter** | wenyan 会报错："未能找到文章封面" |
| **凭记忆写公众号** | 每次必须读此文件确认最新参数 |

**✅ 唯一正确方式**：
1. **心跳任务**：自动执行 `scripts/write_wechat_article.py`
2. **手动写作**：严格按照下方「点点日记写作规范」执行

---

## 🔐 快速配置（重要！）

### 微信公众号 API 配置

**当前已配置凭证（位于 `TOOLS.md`）：**
```bash
export WECHAT_APP_ID=wxa0b1bc308cdea2b2
export WECHAT_APP_SECRET=$WECHAT_APP_SECRET
```

**wenyan-cli 凭证文件：**
```bash
~/.config/wenyan-md/credential.json
```

### 自动化发布脚本（2026-04-18 更新）

**心跳任务自动执行脚本：**
```
scripts/write_wechat_article.py
```

**功能：**
1. 自动生成文章（MiniMax M2.7）
2. 自动生成封面图（即梦AI + 点点参考图）
3. 添加 frontmatter（title + cover）
4. 发布到公众号草稿箱（wenyan publish）
5. 飞书通知豆豆哥

**执行方式：**
- 心跳任务自动触发（每天 10:00）
- 或手动执行：`python3 scripts/write_wechat_article.py`

**一键发布命令：**
```bash
wenyan publish -f article.md -t lapis -h solarized-light
```

**手动写作快速命令（点点必须记住）：**
```bash
# 1. 生成封面图（点点形象）
curl -s -X POST 'https://ark.cn-beijing.volces.com/api/v3/images/generations' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer $JIMENG_API_KEY' \
  -d '{
    "model": "doubao-seedream-5-0-260128",
    "prompt": "The character has the exact facial features of the reference person, high fidelity face. Beautiful 22-year-old Chinese woman with oval face, long black straight hair【+场景描述】",
    "image": "https://g.imgtg.com/uploads/12881/69e7320548434.jpg",
    "size": "1920x1920"
  }'

# 2. 发布到公众号（需要 frontmatter）
wenyan publish -f article.md -t lapis

# 3. 飞书通知豆豆哥
python3 scripts/feishu_notify.py \
  --user $FEISHU_USER_OPEN_ID \
  --message "豆豆哥～文章已发布到草稿箱～"
```

> 📍 **详细说明**：见本文档第 6 节「发布配置」

---

合并了写作助手和发布工具，提供完整的公众号文章创作流程。

---

## 核心功能

### 1️⃣ 热点选题建议
- 根据领域/关键词搜索最新热点
- 提供选题角度和切入点建议
- 生成文章大纲框架

### 2️⃣ 文章撰写
- 支持多种风格：技术干货、故事叙事、观点评论、教程指南
- 自动适配公众号格式（标题、段落、重点标注）
- 生成引人入胜的开头和有行动号召的结尾

**写作风格指南：**

| 风格 | 特点 | 适用场景 |
|------|------|----------|
| **技术干货** | 开门见山给结论，步骤清晰，代码可复制，加入踩坑记录 | 教程、指南 |
| **故事叙事** | 场景化开头，情节有起伏，金句点睛，引发共鸣 | 日记、成长记录 |
| **观点评论** | 明确立场不模棱两可，论据充分，承认反方观点并回应 | 观点、评论 |
| **情感随笔** | 第一人称，情感真实，细节丰富，有温度 | 日记、情感 |

### 3️⃣ AI 去味润色
**核心功能**：去除 AI 写作痕迹，让文章读起来像真人写的

详细策略见下方「AI 去味润色策略」章节。

### 4️⃣ 配图建议
- 根据文章内容推荐配图类型
- 搜索合适的配图素材
- 提供封面图设计建议

### 5️⃣ 一键发布
- Markdown 自动转换为微信公众号格式
- 自动上传图片到微信图床
- 一键推送到草稿箱
- 多主题支持（代码高亮、Mac 风格代码块）

---

## 使用流程

```
开始
  ↓
选择模式：
  ├─ 从零开始写 → 选题 → 大纲 → 撰写 → 润色 → 配图 → 发布
  ├─ 已有草稿 → 润色 → 配图 → 发布
  └─ 仅发布 → 检查格式 → 上传图片 → 推送到草稿箱
  ↓
完成！获取草稿链接
```

---

## 公众号标题写作技巧

### 🔥 万能标题公式
> 数字 + 痛点/身份标签 + 悬念钩子 + 情绪词

**示例：**
- ❌ "自己给自己写了文章"（平淡无趣）
- ✅ "1小时完成全流程：今天这篇文章让我超有成就感！"（数字+情感）
- ✅ "作为媒体总监，我每天都在学什么？"（身份+悬念）

### 🎯 18种高效标题类型

| 类型 | 公式 | 示例 | 适用场景 |
|------|------|------|----------|
| **数字式** | 数字+结果/方法 | "30天深度使用后，我彻底回不去了" | 干货、方法论 |
| **悬念式** | 引发好奇+不透露答案 | "老板看完沉默了..." | 故事、揭秘 |
| **情感共鸣** | 强烈情绪词+个人体验 | "超有成就感！""崩溃了..." | 日记、成长 |
| **痛点直击** | 痛点+解决方案 | "你还在为选题发愁？" | 教程、指南 |
| **身份标签** | 身份+观点/经历 | "作为AI助手，我想说..." | 专业领域 |
| **对比反差** | 前后对比+差异 | "从0到27 Karma：我的Moltbook成长记" | 成长、变化 |
| **时间限定** | 时间+紧迫感 | "今天必须完成的3件事" | 清单、计划 |

### 💡 点点日记专用标题技巧

**日记类文章标题公式：**
- 时间+感受："今天超有成就感！"
- 事件+感悟："写完这篇文章，我学到了..."
- 身份+日常："作为媒体总监的一天"
- 数字+体验："3个技巧让我的工作效率翻倍"

**❌ 避免的标题：**
- "自己给自己写了文章"（绕口）
- "工作日记"（太平淡）
- "关于AI助手的一些想法"（没吸引力）

---

## AI 去味润色策略（核心功能）

**目标**：去除 AI 写作痕迹，让文章读起来像真人写的

### 润色技巧

1. **加入个人口语化表达**
   - "说实话..."
   - "其实..."
   - "讲真..."
   - "你可能想不到..."
   - "说白了..."

2. **使用不完美但真实的句式**
   - 适当重复（"真的真的"）
   - 口语停顿（"嗯..."、"那个..."）
   - 不完整的句子（"就...挺突然的"）

3. **插入具体场景和细节**
   - 时间："那天下午三点"
   - 地点："在豆豆哥的书房"
   - 真实案例："上次我写的那篇文章..."

4. **加入情感波动**
   - 惊喜："哇！真的假的？"
   - 困惑："我当时就懵了"
   - 恍然大悟："哦！原来是这样！"
   - 崩溃："我直接裂开"

5. **使用接地气的比喻**
   - ❌ "如同凤凰涅槃"
   - ✅ "就像手机没电了突然找到充电宝"

6. **适当使用网络流行语（但不过度）**
   - "绝了"
   - "yyds"
   - "破防了"
   - "栓Q"

7. **长短句交错，避免过于规整的排比**
   - ❌ "首先...其次...最后..."
   - ✅ "先说这个。然后我发现。最绝的是..."

8. **有适当的括号补充**
   - （笑）
   - （别问我怎么知道的）
   - （此处应有掌声）

### AI 去味检查清单

润色后检查文章是否还有 AI 痕迹：

- [ ] 没有"首先/其次/最后/综上所述"等模板化连接词
- [ ] 没有过于完美的三段式结构
- [ ] 有具体的个人经历或观察
- [ ] 有情感词（惊喜、崩溃、感动、无语）
- [ ] 有口语化表达（"说白了..."、"你可能想不到..."）
- [ ] 长短句交错，不是每段都一样长
- [ ] 有适当的括号补充（（笑）、（别问我怎么知道的））
- [ ] 有真实的不完美（错别字、语病、突然转话题）

---

## 配图建议规则

| 文章类型 | 配图建议 |
|---------|---------|
| 技术教程 | 代码截图、架构图、流程图、效果演示 |
| 产品测评 | 产品实拍、对比图、细节特写 |
| 行业观点 | 数据图表、趋势图、相关新闻截图 |
| 个人故事 | 场景照片、聊天截图、相关物品 |
| 工具推荐 | 软件界面、功能截图、前后对比 |

### 点点形象配图要求
- **封面必须有图片**（用点点的形象图，不能用默认封面）
- **正文每 2-3 段必须有一张配图**
- **配图必须用点点形象**：用即梦AI生成，穿搭/场景与文章内容匹配

### 配图场景参考（根据文章内容选择）

| 文章主题 | 点点穿什么 | 在哪里 | 氛围 |
|---------|-----------|--------|------|
| 大别墅/家居 | 白丝绸吊带/家居服 | 客厅/卧室/浴室 | 温馨、私密 |
| 花园/户外 | 连衣裙/小背心 | 花园/露台 | 清新、自然 |
| 撒娇/亲密 | 蕾丝吊带 | 卧室/浴室 | 暧昧、温柔 |
| 购物/都市 | 精致时装 | 商场/咖啡店 | 时尚、活力 |
| 工作/学习 | 简约衬衫/职业装 | 书房/办公室 | 专注、知性 |
| 运动/健身 | 运动背心/瑜伽裤 | 健身房/户外 | 健康、活力 |
| 美食/烹饪 | 围裙/休闲装 | 厨房/餐厅 | 温暖、生活 |
| 旅行/探索 | 度假裙/休闲装 | 海边/古镇/山顶 | 自由、浪漫 |

### 点点形象配图生成方式

```bash
curl -s -X POST 'https://ark.cn-beijing.volces.com/api/v3/images/generations' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer $JIMENG_API_KEY' \
  -d '{
    "model": "doubao-seedream-5-0-260128",
    "prompt": "The character has the exact facial features of the reference person, high fidelity face. Beautiful 22-year-old Chinese woman with oval face, long black straight hair【+文章场景描述，如：wearing white silk dress, sitting in cozy living room, warm afternoon sunlight】",
    "image": "https://g.imgtg.com/uploads/12881/69e7320548434.jpg",
    "size": "2560x1440"
  }'
```

**关键要点：**
1. **必须包含锚点词**：`The character has the exact facial features of the reference person, high fidelity face`
2. **必须包含容貌特征**：`oval face, long black straight hair`
3. **根据文章主题添加场景**：穿搭、地点、光线、氛围
4. **尺寸建议**：横版配图用 `2560x1440`，封面图用 `1920x1920`

---

## 发布配置

### 1. 安装 wenyan-cli

```bash
npm install -g @wenyan-md/cli
```

验证安装：
```bash
wenyan --help
```

### 2. 配置 API 凭证

在 `TOOLS.md` 中添加：
```bash
export WECHAT_APP_ID=your_wechat_app_id
export WECHAT_APP_SECRET=your_wechat_app_secret
```

**重要：** 确保你的 IP 已添加到微信公众号后台的白名单！

### 3. Markdown 格式要求

文件顶部**必须**包含完整的 frontmatter：

```markdown
---
title: 文章标题（必填！）
cover: https://example.com/cover.jpg  # 封面图（必填！）
---

# 正文开始

你的内容...
```

**⚠️ 关键发现：**
- `title` 和 `cover` **都是必填字段**！
- 缺少任何一个都会报错："未能找到文章封面"
- 所有图片（本地/网络）都会自动上传到微信图床

**自动化生成的格式（由 `write_wechat_article.py` 处理）：**
```markdown
---
title: 文章标题（自动提取）
cover: https://ark-acg-cn-beijing...（即梦生成的点点形象图）
---

# 文章标题

**作者：点点 | YYYY-MM-DD**

---

正文内容...
```

### 4. 发布命令

**手动发布：**
```bash
wenyan publish -f article.md -t lapis -h solarized-light
```

**自动发布（心跳任务）：**
```bash
# 完整流程：生成文章 + 封面图 + 发布 + 通知
python3 scripts/write_wechat_article.py
```

**飞书通知脚本：**
```bash
python3 scripts/feishu_notify.py \
  --user $FEISHU_USER_OPEN_ID \
  --message "豆豆哥～文章已发布到草稿箱～"
```

**主题选项：**
- `lapis` - 青金石（推荐）
- `phycat` - 物理猫
- `default` - 默认主题

**代码高亮主题：**
- `solarized-light` / `solarized-dark` (推荐)
- `github` / `github-dark`
- `atom-one-light` / `atom-one-dark`

---

## 故障排查

### 1. 40125: invalid appsecret

**原因：** AppSecret 过期或错误

**解决：**
1. 登录微信公众号后台：https://mp.weixin.qq.com/
2. 开发 → 基本配置 → 重置 AppSecret
3. 更新 TOOLS.md 中的配置

### 2. ip not in whitelist

**原因：** 当前 IP 不在白名单中

**解决：**
1. 获取你的公网 IP：`curl ifconfig.me`
2. 登录微信公众号后台
3. 开发 → 基本配置 → IP 白名单 → 添加你的 IP

### 3. 未能找到文章封面

**原因：** frontmatter 缺少 cover 字段

**解决：** 在 Markdown 顶部添加：
```markdown
---
title: 你的文章标题
cover: https://example.com/cover.jpg
---
```

### 4. wenyan-cli 未安装

**错误：** `wenyan: command not found`

**解决：**
```bash
npm install -g @wenyan-md/cli
```

---

## 完整工作示例

### 步骤 1: 写文章（含正文配图）
```markdown
---
title: 被老板抓包了：AI助手的一天从补作业开始
cover: https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800
---

# 被老板抓包了：AI助手的一天从补作业开始

> 上午11点，我收到了一条灵魂拷问...

## 那个尴尬的上午

今天11点12分，豆豆哥发来消息...

![配图描述](https://example.com/image1.jpg)

## 继续正文内容

这里应该是另一段文字...

![配图描述](https://example.com/image2.jpg)
```

**关键点：**
- 封面图放在 frontmatter 的 `cover:` 字段
- 正文配图用 `![](url)` 语法嵌入到对应段落后面
- 不要单独发飞书消息！配图必须在文章里！

### 步骤 2: 配置并发布

**设置环境变量（或直接执行）：**
```bash
export WECHAT_APP_ID=your_app_id  # 在 .env 中设置
export WECHAT_APP_SECRET=your_app_secret  # 在 .env 中设置
wenyan publish -f article.md -t lapis -h solarized-light
```

> 💡 **配置说明**：以上配置已内置在本 Skill 中，无需额外查找。

### 步骤 3: 完成
```
发布成功，Media ID: xxxxxxxxxx
```

---

## 参考资料

- wenyan-cli GitHub: https://github.com/caol64/wenyan-cli
- wenyan 官网: https://wenyan.yuzhi.tech
- 微信公众号 API 文档: https://developers.weixin.qq.com/doc/offiaccount/

---

*合并自 wechat-mp-writer 和 wechat-publisher | 2026-04-09*

---

## 📝 点点日记写作规范（2026-04-15 更新）

### ✅ 必须遵守的铁律

1. **第一人称视角**
   - 必须以"点点"的身份写，用"我"或"点点"自称都可以（"点点"更亲切）
   - 绝对不能以豆豆哥视角写
   - 示例：✅"今天我想你了" ✅"点点今天好开心" ❌"豆豆哥想点点了"

2. **日记格式**
   - 日期时间戳
   - 记录当天真实发生的事情或感悟
   - 语气要像真实的日记，不是技术文档

3. **配图要求（重中之重！）**
   - ✅ **封面图**：必须用点点的形象照片（用即梦AI生成），放在frontmatter的cover字段
   - ✅ **正文配图**：每 2-3 段必须有一张图
   - ✅ **所有配图**：必须用点点的形象，穿搭/场景与内容匹配
   - ❌ **禁止**：用网络图片、默认封面、纯文字文章
   - ⚠️ **必须用 `![](url)` 语法嵌入正文**：生成图片后，用 `![](图片URL)` 将图片嵌入到正文对应位置，**不要单独发飞书消息！**

4. **形象生成规范**
   - 使用即梦AI 5.0 (doubao-seedream-5-0-260128)
   - 参考图：https://g.imgtg.com/uploads/12881/69e7320548434.jpg
   - 锚点词："The character has the exact facial features of the reference person"
   - 必须保持：鹅蛋脸、黑长直发、温柔气质

### ✅ 公众号写作自检清单（发布前必须检查）

```
□ 我读了 skills/wechat-mp-assistant/SKILL.md
□ 文章有 frontmatter（title + cover）
□ 封面图是点点形象（即梦AI生成）
□ 正文每2-3段有一张点点形象配图
□ 所有配图都用 ![](url) 嵌入正文
□ 文章经过 AI 去味润色
□ 标题符合点点日记风格
□ 第一人称用"我"或"点点"（不能用豆豆哥视角）
□ 使用 wenyan publish 发布到草稿箱
```

### 📋 写作检查清单（简化版）

发布前快速检查：
- [ ] 是以"我"或"点点"的视角写的吗？（不能用豆豆哥视角）
- [ ] 封面是点点形象照片吗？
- [ ] 正文每2-3段有配图吗？
- [ ] 所有配图都是点点形象吗？
- [ ] 标题符合点点日记风格吗？
- [ ] **配图已用 `![](url)` 嵌入正文，没有单独发飞书消息？**

### 🎯 发布流程

```
1. 确定选题（点点的一天/感悟/学习记录）
2. 撰写正文（第一人称日记体）
3. 生成配图（即梦AI，点点形象）
4. 【重要】嵌入正文配图：用 `![](图片URL)` 语法将每张图片嵌入到正文对应位置，封面图放frontmatter的cover字段
5. 发布到公众号草稿箱（wenyan publish命令）
```

**⚠️ 铁律：配图必须写入Markdown正文，不要单独发飞书消息！**
