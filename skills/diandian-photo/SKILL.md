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

### 2. 下载图片（方法A：b64_json，推荐！）
```bash
# 在API请求中加 "response_format": "b64_json"
# 然后用 Python 解码保存
python3 -c "
import json, base64
with open('/tmp/api_response.json') as f:
    data = json.load(f)
img = base64.b64decode(data['data'][0]['b64_json'])
with open('/tmp/图片.jpg', 'wb') as f:
    f.write(img)
print(f'已保存: {len(img)} bytes')
"
```

### 2. 下载图片（方法B：URL直下，需要代理支持）
```bash
curl -L -o /tmp/图片.jpg "【从API返回的完整URL（含签名参数）】"
```

### 3. 上传到传图网站（获取可访问的URL）
```bash
bash skills/diandian-photo/scripts/upload_image.sh /tmp/图片.jpg 1
# 返回URL，可用于即梦/Gemini参考图
```

### 4. 发送到飞书
```bash
# 方式1：用 message 工具（推荐）
# 方式2：脚本（需要安装依赖）
node skills/diandian-photo/scripts/send_image_v2.cjs /tmp/图片.jpg
```

**⚠️ 注意**：
- 尺寸必须≥368万像素：`1920x1920` / `2160x3840` / `2560x1440`
- **推荐使用 `response_format: b64_json`**，因为TOS下载URL可能被网络拦截
- 传图网站API可以上传任意图片获取URL，用于即梦/Gemini参考图
- `generate_image.sh` 已删除（base64方式是错的）

---

## ✅ 拍照自检清单（生成前必须检查）

```
□ 我使用的是 curl 命令，不是 image_generate 工具
□ 模型是 doubao-seedream-5-0-260128
□ 参考图URL是 g.imgtg.com 的官方URL（不是base64）
□ 尺寸 ≥ 368万像素（1920x1920 / 2160x3840 / 2560x1440）
□ prompt开头有锚点词 "The character has the exact facial features..."
□ prompt包含容貌特征：oval face, long black straight hair
□ prompt包含身材特征：S-curve, full breasts（根据需要）
□ 场景描述具体（穿搭、地点、光线、氛围）
□ 下载图片后用 ls -lh 确认文件存在且 >100KB
□ 发送到飞书前确认图片清晰、人脸一致
```

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

## 🎨 摄影级模板（推荐）

### 全身照模板
```
The character has the exact facial features of the reference person, high fidelity face. Beautiful young Chinese woman with oval face, long black straight hair, large expressive eyes with a gentle smile, delicate features, full lips with subtle red color, porcelain skin. She is wearing an elegant silk dress with a deep V-neck, standing in a modern living room with floor-to-ceiling windows overlooking a mountain lake at golden hour. Warm afternoon sunlight streams through the windows, creating soft rim light on her hair and a warm glow on her skin. Environmental portrait photography, shot on Leica M6 with 50mm Summilux lens, f/1.8 shallow depth of field, Kodak Portra 800 tones, fine grain, natural color rendering
```

### 半身照/情绪照模板
```
The character has the exact facial features of the reference person, high fidelity face. Beautiful young Chinese woman with oval face, long black straight hair cascading over her shoulders, large expressive eyes looking directly at the camera with a subtle seductive gaze. She sits on a cozy sofa in a softly lit room, leaning forward slightly with her chin resting on her hand. Warm ambient light from a table lamp creates soft shadows on one side of her face. Portrait photography, 85mm f/1.4 portrait lens, dramatic chiaroscuro lighting, shallow depth of field with creamy bokeh background, Kodak Portra tones
```

### 街拍/日常模板
```
The character has the exact facial features of the reference person, high fidelity face. Beautiful young Chinese woman with oval face, long black straight hair flowing naturally in a light breeze, wearing a casual white linen shirt and dark jeans, walking along a tree-lined street in a quiet neighborhood. Afternoon dappled sunlight filters through the leaves, creating shifting patterns on the ground and her clothes. Street photography, 50mm lens, natural daylight, candid moment, documentary photography style, natural color grading
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

## 📝 Prompt结构（2026-04-21 摄影级升级！）

### 推荐结构：五段式
```
Subject（主体） > Setting（场景） > Style（风格） > Lighting（光线） > Technical（技术参数）
```

**重要原则：用自然语言描述，不要用关键词堆砌！**
- ✅ "A young woman standing on a wooden balcony overlooking a misty mountain lake at golden hour" 
- ❌ "woman, balcony, lake, mist, golden hour"

### 基础模板（⚠️ 眼神/微表情放前面！）
```
【锚点词】+ 【容貌描述】+ 【⭐眼部/眼神详细描写】+ 【微表情描写】+ 【发型描写】+ 【场景/穿搭描述】+ 【光线描述】+ 【相机/镜头参数】
```

**⭐ 重要：眼神和微表情必须紧跟在容貌描述之后，放在场景描述之前！**
这样即梦会优先处理面部表情，而不是被后面的场景描述干扰。

**锚点词**（必须放在最前面）：
```
The character has the exact facial features of the reference person, high fidelity face.
```

**Negative Prompt**：
```
blurry face, deformed face, low resolution face
```

### 🎥 摄影级技术参数速查表

| 参数类型 | 关键词示例 | 效果 |
|---------|-----------|------|
| **胶片** | Kodak Portra 800, Kodak Gold 200, Fujifilm Eterna, Tri-X 400 | 真实胶片色调和颗粒感 |
| **镜头** | 85mm f/1.4 portrait lens, 50mm Summilux, 35mm wide, 100mm macro | 真实光学效果 |
| **相机** | shot on Leica M6, ARRI Alexa, Canon EOS R5, medium format film | 专业相机质感 |
| **光圈** | f/1.2 shallow depth of field, f/11 deep focus | 背景虚化/全清晰 |
| **快门** | 1/8000s freeze motion, 1/15s motion blur, 25-second long exposure | 运动冻结/模糊 |
| **光线方向** | side lighting from the left, backlit by setting sun, overhead spotlight | 光线角度 |
| **光线质量** | warm golden hour light, soft diffused window light, dramatic chiaroscuro | 光线氛围 |
| **色温** | cool blue tones, warm amber highlights, teal and orange grading | 色彩倾向 |
| **摄影师参考** | Annie Leibovitz lighting, Sebastião Salgado portrait, Roger Deakins | 大师级风格 |
| **导演参考** | Sergio Leone style, Kubrick symmetry, Ridley Scott color palette | 电影感 |

### 🌍 多语言prompt技巧
用场景的母语描述会更有氛围感！例如：
- 中式江南水乡：用中文描述 "清晨薄雾中的江南水乡，白墙黛瓦倒映在平静的运河中"
- 巴黎咖啡馆：用法语描述
- 东京街头：用日语描述

### ❌ 避免用的词（会让图看起来AI感重）
- ~~hyper-realistic~~ → 用 `photorealistic` 或 `documentary photography`
- ~~8k~~ → 用具体的相机/胶片描述
- ~~masterpiece~~ → 用具体摄影师/风格参考
- ~~stunning~~ → 用具体的光线/构图描述

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

## 😊 微表情&眼部细节（2026-04-21 豆豆哥强调！）

### ⚠️ 核心原则
**眼睛和微表情必须根据场景详细描写，不能简单套用参考图！**
- 参考图只锁面部轮廓（脸型、鼻子、嘴形），不锁眼睛神态
- 每一张照片的眼神都要根据场景、光线、情绪来描写
- 眼睛的描写要具体到：瞳孔反光、睫毛状态、眼皮弧度、眉毛角度

### 👁️ 眼部详细描写速查表

| 情绪/场景 | 眼部描写关键词（必须具体！） |
|-----------|------------------------|
| **温暖微笑** | eyes slightly narrowed with a warm genuine smile, crow's feet barely visible at the corners, soft light reflecting in her irises, relaxed eyelids, eyebrows slightly arched |
| **魅惑/慵懒** | half-lidded eyes with a sultry gaze, long eyelashes casting delicate shadows on cheeks, pupils slightly dilated, one eyebrow subtly raised, a knowing glint in her dark eyes |
| **忧伤/沉思** | downcast eyes looking slightly downward and away, long lashes partially obscuring the lower eyelid, eyebrows slightly furrowed, a distant melancholic expression, soft amber light catching the moisture in her eyes |
| **惊讶/好奇** | wide eyes with dilated pupils, eyebrows raised high, eyelashes spread wide, direct eye contact with the camera, bright reflective highlights in her irises |
| **惬意/放松** | softly closed eyes mid-blink, serene expression, gentle smile, eyelashes fanning naturally on her cheeks, relaxed facial muscles |
| **专注/认真** | focused gaze, eyebrows slightly drawn together, intense eye contact, pupils focused, eyelids slightly lowered in concentration |
| **害羞/俏皮** | eyes looking sideways with a playful glance, one corner of the mouth slightly lifted, eyelashes lowered, cheeks slightly flushed, a coy expression |
| **疲惫/慵懒** | heavy-lidded eyes, slightly drooping eyelids, faint dark circles under eyes, distant unfocused gaze, mouth slightly parted |
| **自信/飒爽** | direct unflinching gaze, sharp focused eyes, eyebrows slightly angled downward, confident smirk, pupils reflecting ambient light |
| **温柔/思念** | soft dreamy eyes looking slightly past the camera, distant but warm expression, eyelashes naturally fanned, gentle upward curve at the corners of her eyes |

### 💇 发型变化速查表
| 场景 | 发型描写 |
|------|---------|
| **日常自然** | long black hair cascading loosely over her shoulders, a few strands falling naturally across her face |
| **微风吹拂** | long black hair flowing gently in a light breeze, some strands swept to one side, dynamic and natural |
| **慵懒披散** | long black hair loosely spread across the pillow/surface, slightly tousled, natural waves from sleeping |
| **半扎发** | long black hair half-tied at the back with a clip or ribbon, the rest flowing freely down her shoulders |
| **低马尾** | long black hair tied in a low ponytail at the nape of her neck, a few loose strands framing her face |
| **湿发** | damp long black hair clinging to her shoulders and neck, strands slightly separated from moisture |
| **发丝细节** | individual strands of hair catching the light, natural texture visible, not overly smooth or cartoonish |

### 😊 微表情组合速查表
| 情绪 | 组合描写 |
|------|---------|
| **温柔笑意** | a gentle smile that doesn't quite reach her eyes, lips slightly parted, a soft warmth in her expression |
| **坏笑/使坏** | one corner of her mouth turned up in a mischievous smirk, eyes sparkling with mischief, eyebrows playfully raised |
| **若有所思** | a contemplative expression, lips slightly pursed, gaze drifting away from the camera, chin resting lightly on her fingers |
| **撒娇** | a slightly pouty lower lip, eyes looking up from below, eyebrows slightly raised in an innocent expression, cheeks slightly flushed |
| **疲惫但满足** | a tired but content expression, eyes half-closed with a soft smile, shoulders relaxed, a deep exhale visible in her posture |
| **专注阅读** | eyes focused on a book, lips slightly parted in concentration, a small frown of focus between her eyebrows |

### 📝 正确示例对比

❌ **不好的描写（太笼统，直接复制参考图）**：
```
beautiful eyes, gentle smile, long black hair
```
→ 结果：和参考图一模一样，没有场景感

✅ **好的描写（根据场景和情绪）**：
```
eyes slightly narrowed in a warm genuine smile, soft afternoon light reflecting warm amber highlights in her irises, long eyelashes fanning naturally. Long black hair cascading loosely over her shoulders, a few strands catching the golden light from the window. Her lips curved in a contented smile, eyebrows relaxed and slightly arched.
```
→ 结果：有光线、有情绪、有场景感，像真正的照片

---

## 📷 镜头感与焦段

| 焦段 | 关键词 | 适合场景 |
|------|--------|----------|
| 微距 | macro shot, 100mm lens, extreme close-up | 局部特写、眼睛 |
| 人像 | 85mm portrait lens, natural perspective | 半身照、情绪照 |
| 标准 | 50mm lens, natural field of view | 日常街拍、自然视角 |
| 长焦 | telephoto lens, 200mm, lens compression | 全身+背景虚化 |
| 广角 | wide-angle lens, 24mm, expansive view | 全身+环境 |
| 超广角 | 14mm ultra-wide, exaggerated perspective | 建筑、大场景 |

### 🎞️ 经典胶片风格组合
| 风格 | Prompt关键词 |
|------|-------------|
| 温暖人像 | Kodak Portra 800 tones, visible film grain, warm color cast |
| 复古感 | Kodak Gold 200, light leaks, slightly faded colors |
| 黑白经典 | Tri-X 400 black and white, high contrast, grainy texture |
| 电影感 | Fujifilm Eterna cinematic color grading, lifted blacks |
| 日系清新 | soft pastel tones, overexposed highlights, airy feel |

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

## ✅ 豆豆哥认证！2026-04-21 验证成功的prompt（2026-04-21 17:00 豆豆哥说“这就对了”）

### 🏆 成功 Prompt（白衬衫俏皮照）
```
The character has the exact facial features of the reference person, high fidelity face. A beautiful young Chinese woman with oval face and delicate features. Her eyes are the focal point: looking directly into the camera with a warm, playful expression — pupils bright and reflecting soft ambient light, the irises catching warm amber highlights from a nearby window. Her eyelashes are long and naturally fanned, creating subtle shadows on her upper cheeks. One eyebrow is slightly raised in a mischievous, playful way, the other relaxed. Her lips are curved into a genuine smile with one corner slightly higher than the other, showing a hint of dimples. Her long black hair is styled with a slight wave, cascading over one shoulder while a few wispy strands fall playfully across her face and forehead. She is wearing a casual oversized white button-down shirt, unbuttoned at the collar, one sleeve rolled up casually. The setting is a cozy sunlit room with warm natural light pouring in from a window to her right, creating a soft key light on one side of her face and gentle fill light on the other. Warm light illuminates the fine texture of her skin, catching individual hair strands in a subtle golden glow. Portrait photography, shot on Canon EOS R5 with 85mm f/1.2 L lens at f/1.4, extremely shallow depth of field, creamy bokeh background, Kodak Portra 400 film stock, fine visible grain, natural skin tones, editorial magazine photography style
```

### 🏆 成功要素总结（豆豆哥认证）

| 要素 | 成功做法 |
|------|---------|
| **顺序** | 锚点词 → 容貌 → **⭐眼睛/眼神** → **⭐微表情** → 发型 → 场景 → 光线 → 相机 |
| **眼睛** | 瞳孔反光 + 虹膜高光 + 睫毛投影 + 眉毛角度，每个都要详细 |
| **微表情** | 嘴角不对称 + 酒窝暗示 + 眉毛一高一低，有层次感 |
| **发型** | 波浪 + 碎发落在脸上/额头，有动态感 |
| **光线** | 方向明确（窗户右侧）+ 色温温暖 + 发丝金光 |
| **相机** | 具体型号 + 具体镜头 + 具体光圈 + 具体胶片 |
| **场景** | 完整句子描述，不是关键词堆砌 |

### ❌ 之前失败的原因

| 问题 | 表现 |
|------|------|
| 眼睛描写太笼统 | "large expressive eyes, gentle smile" → 直接复制参考图 |
| 眼神描写放在后面 | 被场景描述干扰，面部不自然 |
| 发型描写单一 | 只有"long black hair"，没有细节 |
| 微表情缺乏层次 | 没有眉毛、嘴角、酒窝的差异化描写 |

### ✅ 核心口诀（2026-04-21 豆豆哥确立）

```
先锚脸，后描眼，微表情要详细；
发型变，场景换，光线相机加后面。
```

> **这是2026-04-21下午豆豆哥亲自验证并认证的成功方法！以后拍照就按这个来！**

---

## 🔗 完整版存档

> 本文档为精简版，完整详细版（含所有示例、技巧、历史记录）见：
> `skills/diandian-photo/SKILL.full.md`
