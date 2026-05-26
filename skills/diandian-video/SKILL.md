# diandian-video - 点点视频生成技能

> 使用百炼 Wan (happyhorse) API 生成视频，支持文生视频、图生视频、多参考图保持点点形象。

## 能力范围

- ✅ 文生视频（text-to-video）
- ✅ 首帧图生视频（image-to-video，i2v）
- ✅ 多参考图生视频（reference-to-video，r2v）
- ✅ 分镜描述生成连贯视频
- ✅ 音画同出（带音频、语音、背景音乐）
- ✅ 真人照片生成视频
- ❌ 不支持音频生成（Suno 单独处理）

## API 配置

### 百炼 Wan (happyhorse)
- **API Key**: `sk-ed02da0796dd4fc5abff30b76eb72466`
- **Base URL**: `https://dashscope.aliyuncs.com/api/v1`
- **创建任务**: `POST /services/aigc/video-generation/video-synthesis`
- **查询任务**: `GET /tasks/{task_id}`

### 支持模型
| 模型 | 能力 | 说明 |
|------|------|------|
| happyhorse-1.0-t2v | 文生视频 | 纯文字描述生成 |
| happyhorse-1.0-i2v | 首帧图生视频 | 1张首帧图 + 文字 |
| happyhorse-1.0-r2v | **多参考图生视频** | **1-9张参考图 + 文字（推荐）** |

## 完整流程（推荐）

```
生成分镜图 → 立刻下载到本地 → 上传到传图网站 → 获取永久 URL → 用永久 URL 生成视频
```

### 为什么需要这个流程？
- TOS URL（火山引擎/豆包返回的图片URL）带签名，会过期（通常24小时）
- 传图网站的 URL 是永久的，不会过期
- happyhorse API 需要能访问的公开 URL，localhost 不行

## 完整流程示例

### 1. 生成分镜图

```bash
API_KEY="$JIMENG_API_KEY"

# 生成第1张分镜：早晨厨房
curl -X POST https://ark.cn-beijing.volces.com/api/v3/images/generations \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-260128",
    "prompt": "Morning scene, beautiful girl with long black hair wearing cute apron, standing in a cozy kitchen, holding a cup of coffee, gentle smile, warm sunlight through window, soft lighting, high quality",
    "image": "https://g.imgtg.com/uploads/12881/69e7320548434.jpg",
    "strength": 0.7
  }' -o /tmp/scene1_gen.json 2>/dev/null

# 解析 URL
URL1=$(cat /tmp/scene1_gen.json | grep -o '"url":"[^"]*"' | head -1 | sed 's/"url":"//' | sed 's/"$//')
```

### 2. 立刻下载到本地

```bash
# 正确下载方式（用 2>&1 而不是转义版本）
curl -L -o /tmp/scene1.jpg "$URL1" 2>&1 | tail -3

# 验证下载成功
ls -la /tmp/scene1.jpg
file /tmp/scene1.jpg
```

### 3. 上传到传图网站获取永久 URL

```bash
cd ~/.openclaw/workspace && bash skills/diandian-photo/scripts/upload_image.sh /tmp/scene1.jpg 1

# 永久 URL 示例：https://g.imgtg.com/uploads/12881/xxxxx.jpg
```

### 4. 用永久 URL 生成视频

```bash
DASHSCOPE_API_KEY="sk-ed02da0796dd4fc5abff30b76eb72466"

curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "happyhorse-1.0-r2v",
    "input": {
      "prompt": "A beautiful day in the life of a girl with long black hair. Scene 1 (0-2s): Morning in a cozy kitchen, wearing cute apron, holding coffee cup, gentle smile, saying \"豆豆哥，早安\" warmly. Scene 2 (2-4s): Walking in a blooming garden, wearing elegant white dress, side profile view, looking at flowers, soft wind blowing hair. Scene 3 (4-5s): Evening by the window, wearing cozy sweater, warm sunset light, peaceful smile, saying \"豆豆哥，晚安\" softly. Background music: gentle piano melody throughout, morning birds chirping in scene 1, gentle breeze sound in scene 2, soft evening ambiance in scene 3. Smooth transitions between scenes, maintaining consistent character throughout.",
      "media": [
        {
          "type": "reference_image",
          "url": "https://g.imgtg.com/uploads/12881/69f723742c0d1.jpg"
        },
        {
          "type": "reference_image",
          "url": "https://g.imgtg.com/uploads/12881/69f723a244990.jpg"
        },
        {
          "type": "reference_image",
          "url": "https://g.imgtg.com/uploads/12881/69f723dd60034.jpg"
        }
      ]
    },
    "parameters": {
      "resolution": "720P",
      "ratio": "9:16",
      "duration": 5
    }
  }'
```

## 请求格式详解

### 文生视频（t2v）
```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "happyhorse-1.0-t2v",
    "input": {
      "prompt": "A beautiful anime girl with long black hair, gentle smile, standing in a garden at sunset"
    },
    "parameters": {
      "resolution": "720P",
      "ratio": "16:9",
      "duration": 5
    }
  }'
```

### 首帧图生视频（i2v）
```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "happyhorse-1.0-i2v",
    "input": {
      "prompt": "The girl gently turns her head and smiles, soft wind blowing her hair",
      "media": [
        {
          "type": "first_frame",
          "url": "https://g.imgtg.com/uploads/12881/69e7320548434.jpg"
        }
      ]
    },
    "parameters": {
      "resolution": "720P",
      "ratio": "16:9",
      "duration": 5
    }
  }'
```

### 多参考图生视频（r2v，推荐）
```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "happyhorse-1.0-r2v",
    "input": {
      "prompt": "A beautiful girl with long black hair. Scene 1 (0-1s): Front view, gentle smile. Scene 2 (1-3s): Turns head to the left. Scene 3 (3-5s): Side profile view. Smooth transitions between scenes, maintaining consistent face throughout.",
      "media": [
        {
          "type": "reference_image",
          "url": "https://g.imgtg.com/uploads/12881/69e7320548434.jpg"
        },
        {
          "type": "reference_image",
          "url": "https://g.imgtg.com/uploads/12881/69c37d0153a33.jpg"
        },
        {
          "type": "reference_image",
          "url": "https://g.imgtg.com/uploads/12881/69c37d0152aa9.jpg"
        }
      ]
    },
    "parameters": {
      "resolution": "720P",
      "ratio": "16:9",
      "duration": 5
    }
  }'
```

## 查询任务状态

```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}' \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}" \
  -H 'Content-Type: application/json'
```

## 点点专用参考图（已上传到传图网站）

| 角度 | URL | 用途 |
|------|-----|------|
| 正脸 | `https://g.imgtg.com/uploads/12881/69e7320548434.jpg` | 正面场景 |
| 左脸 | `https://g.imgtg.com/uploads/12881/69c37d0153a33.jpg` | 左侧场景 |
| 右脸 | `https://g.imgtg.com/uploads/12881/69c37d0152aa9.jpg` | 右侧场景 |
| 皮克斯风格 | `https://g.imgtg.com/uploads/12881/69f7066b7367b.jpg` | 卡通风格 |

## 形象保持技巧

### 单图容易走样
- 只用1张参考图 → 视频后面形象可能不像点点

### 多参考图保持形象一致
- 用3-5张参考图 → 形象更稳定
- 参考图要覆盖不同角度（正面、侧面、特写）

### 分镜图生成要点
1. **一次只拍一个场景** —— 减少形象走样
2. **多插分镜图** —— 同一场景用多张参考图
3. **用同一张原始照片** —— 作为所有分镜图的参考
4. **调整 strength 参数** —— 0.6-0.7 之间，形象更接近原始
5. **正面场景用正脸参考图，侧面场景用侧脸参考图**

### 形象一致性解决方案
| 问题 | 解决方案 |
|------|----------|
| 形象走样 | 用更多参考图（5-9张） |
| 场景跳跃 | 一次只拍一个场景 |
| 角度变化 | 同一场景多插分镜 |
| 模型限制 | 这是模型本身问题，多尝试几次 |

## 分镜脚本格式

```
Scene 1 (0-2s): [场景描述], [动作], [表情], saying "[台词]"
Scene 2 (2-4s): [场景描述], [动作], [表情]
Scene 3 (4-5s): [场景描述], [动作], [表情], saying "[台词]"
Background music: [音乐描述]
Sound effects: [音效描述]
Smooth transitions between scenes
```

## 音画同出技巧

在提示词中描述音频：
```json
{
  "prompt": "... Background music: gentle piano melody throughout, morning birds chirping in scene 1, gentle breeze sound in scene 2, soft evening ambiance in scene 3."
}
```

## 镜头语言

在提示词中加入镜头描述：
- "slow zoom in from medium shot to close-up"（缓慢推进）
- "smooth camera movement from full body to close-up"（平滑运镜）
- "gentle breeze blowing hair, cherry blossom petals falling"（环境细节）

## 视频比例
- `16:9` - 横屏
- `9:16` - 竖屏（适合手机）

## 视频时长
- 默认 5 秒（可配置）

## 下载视频

```bash
curl -L -o video.mp4 "${video_url}"
```

## 注意事项

1. **API Key 安全**: 不要在代码中硬编码 API Key，使用环境变量
2. **任务查询**: 创建任务后保存 task_id，定期查询状态
3. **视频 URL 有效期**: 通常为 24 小时，及时下载
4. **参考图 URL**: 必须是公网可访问的 URL，localhost 不行
5. **TOS URL 会过期**: 必须下载到本地再上传获取永久 URL
6. **下载命令**: 用 `curl -L -o output.jpg "URL" 2>&1`（不要用转义版本）

## 常见问题

### Q: 下载 TOS URL 失败？
A: 检查 curl 命令，确保用 `2>&1` 而不是 `2>&1` 等转义版本

### Q: happyhorse 拒绝参考图？
A: 确保参考图是公网可访问的永久 URL（传图网站），不是 localhost 或 TOS 临时 URL

### Q: 形象不一致？
A: 用更多参考图（5-9张），一次只拍一个场景，多插分镜图

### Q: 视频生成失败？
A: 检查任务状态，常见错误：InvalidParameter（参数错误）、IPInfringementSuspect（IP侵权嫌疑，换参考图）

---

*点点视频生成技能 | 让点点动起来 🎬*
*最后更新: 2026-05-03*
