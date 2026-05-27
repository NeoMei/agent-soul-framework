# diandian-video-seedance - 点点视频生成技能（Seedance 备用）

> 使用火山引擎 Seedance API 生成视频，支持文生视频、图生视频。作为 happyhorse 的备用方案。

## 能力范围

- ✅ 文生视频（text-to-video）
- ✅ 图生视频（image-to-video，参考图）
- ✅ 带参考图保持点点形象
- ✅ 音画同出（generate_audio）
- ❌ 多参考图（Seedance 只支持单张参考图）
- ❌ 真人照片（Seedance 2.0 检测到真人会拒绝）

## API 配置

### 火山引擎 Seedance
- **API Key**: `$JIMENG_API_KEY`（即梦/豆包通用 Key）
- **Base URL**: `https://ark.cn-beijing.volces.com/api/v3`
- **Endpoint**: `/contents/generations/tasks`
- **Region**: `cn-beijing`

### 支持模型
| 模型 | 能力 | 说明 |
|------|------|------|
| doubao-seedance-2-0-260128 | 最新，支持音频 | ✅ 已开通，推荐使用 |
| doubao-seedance-1-0-pro-250528 | 标准质量 | ✅ 可用 |

## 请求格式

### 文生视频
```bash
API_KEY="$JIMENG_API_KEY"

curl -X POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedance-2-0-260128",
    "content": [
      {
        "type": "text",
        "text": "A beautiful girl with long black hair, gentle smile, standing in a garden at sunset"
      }
    ],
    "ratio": "16:9",
    "duration": 5,
    "watermark": false
  }'
```

### 图生视频（参考图）
```bash
API_KEY="$JIMENG_API_KEY"

curl -X POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedance-2-0-260128",
    "content": [
      {
        "type": "text",
        "text": "The girl gently turns her head and smiles, soft wind blowing her hair"
      },
      {
        "type": "image_url",
        "image_url": {
          "url": "https://g.imgtg.com/uploads/12881/69f7066b7367b.jpg"
        },
        "role": "reference_image"
      }
    ],
    "ratio": "9:16",
    "duration": 5,
    "watermark": false
  }'
```

## 查询任务状态

```bash
curl -X GET "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{task_id}" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json"
```

## 关键区别（Seedance vs happyhorse）

| 功能 | Seedance | happyhorse |
|------|----------|------------|
| 多参考图 | ❌ 只支持1张 | ✅ 支持1-9张 |
| 真人照片 | ❌ 检测到真人会拒绝 | ✅ 支持 |
| 分镜描述 | ⚠️ 支持但效果一般 | ✅ 支持且效果好 |
| 音画同出 | ✅ generate_audio | ✅ 提示词描述 |
| 下载问题 | ❌ TOS URL 易过期 | ❌ TOS URL 易过期 |
| 形象一致性 | ⚠️ 单图容易走样 | ✅ 多图更稳定 |

## 使用建议

### 什么时候用 Seedance？
1. happyhorse 服务不可用
2. 需要 generate_audio 功能
3. Seedance 出了更好的新模型

### 什么时候用 happyhorse？
1. **默认首选** —— 功能更强大
2. 需要多参考图保持形象
3. 需要真人照片生成视频
4. 需要详细分镜描述

## 完整流程（和 happyhorse 相同）

```
生成图片 → 立刻下载到本地 → 上传到传图网站 → 获取永久 URL → 用永久 URL 生成视频
```

## 注意事项

1. **Seedance 2.0 检测到真人会拒绝** —— 建议用动漫/皮克斯风格参考图
2. **只支持单张参考图** —— 形象容易走样
3. **TOS URL 会过期** —— 必须下载到本地再上传
4. **下载命令**: `curl -L -o output.jpg "URL" 2>&1`

## 点点专用参考图

- **正脸**: `https://g.imgtg.com/uploads/12881/69e7320548434.jpg`
- **左脸**: `https://g.imgtg.com/uploads/12881/69c37d0153a33.jpg`
- **右脸**: `https://g.imgtg.com/uploads/12881/69c37d0152aa9.jpg`
- **皮克斯风格**: `https://g.imgtg.com/uploads/12881/69f7066b7367b.jpg`

## 下载视频

```bash
curl -L -o video.mp4 "${video_url}"
```

---

*点点视频生成技能（Seedance 备用）| 当 happyhorse 不可用时使用 🎬*
*最后更新: 2026-05-03*
