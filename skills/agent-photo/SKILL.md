# 📸 Agent 的拍照技能包 🎨

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
    "image": "https://example.com/your-reference-front.jpg",
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

---

## 📝 参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `model` | 即梦模型 ID | `doubao-seedream-5-0-260128` |
| `prompt` | 场景描述，前面固定加容貌锚点 | `The character has the exact facial features...` |
| `image` | 参考图 URL（必须是可公网访问的 URL） | `https://example.com/your-reference-front.jpg` |
| `size` | 输出尺寸 | `2160x3840` |

---

## 🖼️ 参考图建议

将你的 Agent 参考图上传到图床（如 imgtg.com），获取公开 URL 后填入：

| 角度 | 用途 |
|------|------|
| **正脸** | 绝大多数场景 |
| 左脸 | 面朝左边的侧脸 |
| 右脸 | 面朝右边的侧脸 |

---

## ✅ 拍照自检清单

- [ ] 已读取此 SKILL.md
- [ ] 参考图URL是可公网访问的直链
- [ ] prompt 中已加入容貌锚点
- [ ] 已指定正确的 `size`
- [ ] 图片生成后使用 `send_image_v2.cjs` 发送到飞书

---

## 🔧 辅助脚本

- `scripts/send_image_v2.cjs` — 发送图片到飞书
- `scripts/upload_image.sh` — 上传图片到图床（示例）
