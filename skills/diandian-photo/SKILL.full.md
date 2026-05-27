# 📸 点点的拍照技能包 🎨

> **30秒速读**：用 `curl` 调用即梦API，绝不用 `image_generate` 工具！

---

## 🚨 绝对禁止

| ❌ 禁止 | 原因 |
|--------|------|
| **使用 `image_generate` 工具** | 调用MiniMax模型，不是即梦！参考图不生效，人脸会崩！ |
| **用base64传参考图** | 即梦API不支持，必须用URL字符串 |
| **凭记忆拍照** | 每次必须读此文件确认最新参数 |

---

## 📌 快速命令（✅ 唯一正确方式）

### 1. 生成图片
```bash
curl -s -X POST 'https://ark.cn-beijing.volces.com/api/v3/images/generations' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer $JIMENG_API_KEY' \
  -d '{
    "model": "doubao-seedream-5-0-260128",
    "prompt": "The character has the exact facial features of the reference person, high fidelity face. 【场景描述】",
    "image": "https://g.imgtg.com/uploads/12881/69e7320548434.jpg",
    "size": "2160x3840"
  }'
```

### 2. 下载图片
```bash
curl -L -o /tmp/图片.jpg "【从API返回的完整URL（含签名参数）】"
```

### 3. 发送到飞书
```bash
# 方式1：用 message 工具（推荐）
# 方式2：脚本（需要安装依赖）
node skills/diandian-photo/scripts/send_image_v2.cjs /tmp/图片.jpg
```

**⚠️ 注意**：
- 尺寸必须≥368万像素：`1920x1920` / `2160x3840` / `2560x1440`
- `generate_image.sh` 已删除（base64方式是错的）

---

## 🚀 拍照3步法

| 步骤 | 操作 |
|------|------|
| 1. 选模板 | 全身用**勾魂照模板**（见下方），半身/特写去掉"full body" |
| 2. 改场景 | 换穿搭/姿势/背景/光线，**身材容貌永远不改** |
| 3. 发飞书 | 生成→下载→`message`工具发送（或脚本） |

---

## ⚠️ 核心铁律（永远不改）

| 要素 | 描述 |
|------|------|
| 脸型 | oval face（鹅蛋脸） |
| 发色 | long black straight hair（黑长直） |
| 身材 | S-curve, full breasts, cleavage, long legs |

---

## 📸 参考图库

| 角度 | URL | 适用场景 |
|------|-----|----------|
| **正脸** | `https://g.imgtg.com/uploads/12881/69e7320548434.jpg` | 绝大多数场景 |
| 左脸 | `https://g.imgtg.com/uploads/12881/69c37d0153a33.jpg` | 面朝左边的侧脸 |
| 右脸 | `https://g.imgtg.com/uploads/12881/69c37d0152aa9.jpg` | 面朝右边的侧脸 |

> 拍别人/风景/物品时**不需要**参考图！

---

## 🎨 勾魂照模板（全身照）

```
The character has the exact facial features of the reference person, high fidelity face. Beautiful young Chinese woman with oval face, long black straight hair, large expressive eyes with seductive gaze that captures the soul, detailed eyelashes, natural eyebrows, small delicate nose, full lips with subtle red color, porcelain flawless skin, wearing elegant silk dress with deep V-neck that shows prominent cleavage and bust curves, voluptuous S-curve body shape with full breasts, narrow waist, round hips, long toned legs visible, front-facing pose showing attractive body curves, provocative pose, pure yet seductive expression, innocent but alluring, bedroom atmosphere, warm romantic lighting, shallow depth of field, cinematic quality
```

**半身/特写**：去掉 `full body` 相关描述，尺寸用 `1920x1920`

---

## 📐 三机位配置

| 机位 | 尺寸 | 比例 | 像素 | 说明 |
|------|------|------|------|------|
| 近景（特写） | `1920x1920` | 1:1 | 3.69M | 头像为主 |
| 中景/远景 | `2160x3840` | 9:16 | 8.29M | 半身/全身 ✅竖屏 |
| 横屏 | `2560x1440` | 16:9 | 3.69M | 横屏专用 |

> ⚠️ 竖屏用2160x3840，不要用1920x2560（会拉长）！

---

## 😊 微表情关键词

| 表情 | 关键词 |
|------|--------|
| 魅惑 | seductive eyes, subtle seduction, mysterious smile |
| 忧伤 | melancholic expression, sad eyes, vulnerable look |
| 无奈 | resigned expression, helpless sigh, weary smile |
| 偷偷高兴 | secretly happy but hiding it, composed exterior, longing eyes |

---

## 📝 Prompt结构

```
【锚点词】+ 容貌描述 + 场景描述 + , hyper-realistic, 8k
```

**锚点词**（必须放在最前面）：
```
The character has the exact facial features of the reference person, high fidelity face.
```

**Negative Prompt**：
```
blurry face, deformed face, low resolution face
```

---

## 🌄 非自拍拍照技巧

**什么时候不用参考图**：拍风景/美食/物品时

**横画幅人物保护**（防止压扁）：
```
maintaining accurate limb length and body ratios
body not distorted or stretched despite wide frame
full body shot standing upright
```

---

## 📷 镜头感与焦段

| 焦段 | 关键词 | 适合场景 |
|------|--------|----------|
| 微距 | macro shot, 100mm lens, extreme close-up | 局部特写、眼睛 |
| 人像 | 85mm portrait lens, natural perspective | 半身照、情绪照 |
| 长焦 | telephoto lens, 200mm, lens compression | 全身+背景虚化 |
| 广角 | wide-angle lens, 24mm, expansive view | 全身+环境 |

---

## 🎯 摄影多样化七要素（每次拍照检查）

1. **场景** - 卧室/浴室/客厅/露台/花园
2. **衣服** - 不能全是白丝绸吊带！要换穿搭
3. **镜头角度** - 正面/侧面/俯视/仰视/45度
4. **姿势** - 站/坐/躺/靠/倚/趴
5. **远近景** - 远景(全身)/中景(半身)/近景(特写)
6. **光线** - 柔光/强光/黄金时刻/烛光
7. **微表情** - 开心/撒娇/魅惑/忧伤

---

## 🔗 完整版存档

> 本文档为精简版，完整详细版（含所有示例、技巧、历史记录）见：
> `skills/diandian-photo/SKILL.full.md`
