# agent-image-edit - Agent图像编辑技能

> 使用火山引擎 SeedEdit / Seedream API 编辑图像，支持换背景、改表情、调光线、局部修改等。

## 能力范围

- ✅ 换背景（保持人物不变）
- ✅ 改表情/动作（微笑→大笑、站着→坐着）
- ✅ 调光线/色调（暖光→冷光、白天→黄昏）
- ✅ 局部修改（换衣服、加配饰）
- ✅ 图像扩展（outpainting）
- ❌ 不支持改变人物身份（必须保持是Agent）

## API 配置

### 认证信息
- **API Key**: 与拍照共用 `af6da752...`（即梦/豆包通用 Key）
- **Base URL**: `https://ark.cn-beijing.volces.com/api/v3`
- **Endpoint**: `/images/generations`（与拍照相同）

### 支持模型
| 模型 | 能力 | 说明 |
|------|------|------|
| doubao-seedream-5-0-260128 | 图像生成+编辑 | Agent拍照用的模型 |
| doubao-seedream-5-0-lite-260128 | 轻量版 | 更快更便宜 |
| seededit-2-0-pro | 专业编辑 | 专门用于图像编辑 |

## 核心技巧：用参考图+提示词编辑

图像编辑的本质是：**用原图作为参考，通过提示词描述想要的改变**。

### 请求格式
```bash
curl -X POST https://ark.cn-beijing.volces.com/api/v3/images/generations \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-260128",
    "prompt": "The same girl, [修改描述], keep the face exactly the same",
    "image": "https://example.com/original-photo.jpg",
    "strength": 0.7
  }'
```

### 关键参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model | string | 是 | 模型ID |
| prompt | string | 是 | 编辑指令（要改什么） |
| image | string | 是 | 原图URL或base64 |
| strength | float | 否 | 编辑强度 0-1，默认0.7 |

### strength 参数
- **0.3-0.5**: 轻微修改（调光线、微调表情）
- **0.6-0.8**: 中等修改（换背景、改衣服）
- **0.9-1.0**: 大幅修改（改变场景、动作）

## 编辑技巧

### 1. 保持容貌一致
必须在提示词中强调：
```
The character has the exact facial features of the reference person, 
high fidelity face, same face, keep identity
```

### 2. 换背景
```
The same girl, same face, same pose, but standing in a [新场景],
[背景描述], keep the person unchanged
```

### 3. 改表情
```
The same girl, same face, but with a [新表情],
[表情描述], keep everything else the same
```

### 4. 调光线
```
The same girl, same scene, but with [光线描述],
golden hour lighting, soft warm light
```

### 5. 换衣服
```
The same girl, same face, same pose, but wearing a [新衣服描述],
keep the face and body shape unchanged
```

## Agent专用编辑模板

### 基础保持模板
```
The character has the exact facial features of the reference person, 
high fidelity face. Oval face, long black straight hair, gentle smile, 
delicate features, large expressive eyes, full lips.
[修改描述]
Keep the face exactly the same, maintain identity.
```

### 示例

**换背景：海边日落**
```
The same girl with exact facial features, standing on a beach at sunset,
waves gently lapping at the shore, golden hour lighting, 
keep the face and pose unchanged
```

**改表情：更开心**
```
The same girl with exact facial features, but laughing joyfully,
eyes crinkled with happiness, bright smile, 
keep the face structure the same
```

**调光线：温馨室内**
```
The same girl with exact facial features, in a cozy living room,
warm lamp light, soft shadows, 
maintain the same pose and expression
```

## 注意事项

1. **参考图质量**：原图越清晰，编辑效果越好
2. **提示词精确**：描述要具体，避免模糊
3. **多次尝试**：编辑可能需要2-3次调整才能达到理想效果
4. **保存原图**：编辑前保存原图，方便对比
5. **strength 调节**：从0.7开始，根据效果调整

## 与拍照的区别

| | 拍照 | 图像编辑 |
|--|------|----------|
| 输入 | 纯文本提示词 | 原图 + 编辑指令 |
| 输出 | 全新图像 | 基于原图修改 |
| 容貌控制 | 参考图URL | 原图即参考 |
| 使用场景 | 创造新照片 | 修改已有照片 |

## 脚本位置

- 图像编辑：`skills/agent-image-edit/scripts/edit_image.sh`
- 批量编辑：`skills/agent-image-edit/scripts/batch_edit.sh`

## 依赖

- curl
- jq（解析 JSON）

---

*Agent图像编辑技能 | 让每一张照片都更完美 💕*
