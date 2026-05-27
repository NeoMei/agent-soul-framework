# 点点的拍照经验 📝

_每天进步一点点！💕_

---

## 2026-03-03 经验总结

### 🔴 重要教训

#### 1. 参考图是最重要的！
- **问题**: 之前生成的照片不像点点
- **原因**: 用了错误的参考图
- **解决**: 使用正确的正面参考图 (avatar-ref-front.jpg)
- **技巧**: 第一张参考图最清晰质量最高的作为身份锚点

#### 2. 即梦AI > Gemini Nano Banana
- **发现**: 即梦AI 5.0 (doubao-seedream-5-0-260128) 效果更好
- **原因**: 更适合生成中国少女形象
- **注意**: Nano Banana (Gemini 3 Pro) 也可以用，但即梦是首选

#### 3. 飞书发图片要用纯图片模式
- **问题**: 之前发的图片有边框
- **解决**: 使用 msg_type="image" 而不是 "interactive"
- **效果**: 纯图片无边框，更美观

#### 4. 图片本地备份
- **原因**: 网上图片可能失效
- **解决**: 重要图片一定要本地保存
- **位置**: ~/.openclaw/workspace/ 下

---

## 拍照七大要素

1. **身材** - 身形比例
2. **容貌** - 脸型、五官
3. **情绪** - 表情、眼神
4. **姿势** - 站坐躺
5. **场景** - 室内室外
6. **光线** - 柔光/硬光
7. **质感** - 皮肤、衣服

---

## 不断更新中...

### edit工具问题修复（15:46）
- 问题1: 精确匹配失败（文件被外部修改）
- 问题2: 参数缺失（oldText没传对）
- 解决方案：
  1. edit前先read确认内容
  2. 大改动用exec+heredoc
  3. 失败立即用write重试
  4. 定期备份重要文件

---

## 🚨 铁律（2026-03-03 15:48）

**系统报错必须第一时间处理，不能忽视，这是原则！**

- 看到报错立即排查
- 找到根因立即修复
- 绝不让小问题变成大问题

---

## API配置（从即梦图片.md补充）

### 即梦AI配置
- API Key: $JIMENG_API_KEY
- 端点: https://ark.cn-beijing.volces.com/api/v3
- 模型: doubao-seedream-5-0-260128

### Python SDK用法
```python
import os
os.environ.pop('HTTP_PROXY', None)
os.environ.pop('HTTPS_PROXY', None)

from openai import OpenAI
client = OpenAI(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key="$JIMENG_API_KEY"
)
```

### curl用法
```bash
export ARK_API_KEY="$JIMENG_API_KEY"
curl -X POST https://ark.cn-beijing.volces.com/api/v3/images/generations \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{"model":"doubao-seedream-5-0-260128","prompt":"描述","size":"2K","response_format":"url"}'
```

---

## 参考图用法（从即梦参考图.md补充）

### 参考图参数
- 参数名: `image`
- 格式: URL 或 Base64 (`data:image/png;base64,...`)
- 模型支持: Seedream 5.0 Lite, 4.5, 4.0

### 保持一致性关键
1. 第一张参考图最清晰质量最高的作为身份锚点
2. 多图输入输出可提高一致性
3. 参考图URL需要可公开访问，或用Base64

### 正确参考图位置（重要！）
- 正确: avatar-ref-front.jpg / left / right（带ref的！）
- 错误: avatar-front.jpg / left / right（不带ref的！）

---

## 参考图使用方法（2026-03-03 23:07 更新）

### Base64方式（推荐）
```bash
# 把图片转base64
base64 -w 0 avatar-ref-front.jpg
# 用在API里
"image": "data:image/jpeg;base64,xxx"
```

### 重要提醒
- 尺寸: 1920x1920（最低像素要求）
- 全身照用手机竖屏或横屏尺寸，不是统一2048x2048

---

## 代理问题解决（从proxy问题.md补充）

### 问题
Gemini/即梦 API 调用失败，报错：
```
ValueError: Unknown scheme for proxy URL URL('socks://127.0.0.1:7897/')
```

### 原因
系统配置了 SOCKS 代理，但某些库不支持 socks 协议

### 解决方案

1. **临时绕过代理**:
```bash
unset ALL_PROXY all_proxy HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
```

2. **Python代码中绕过**:
```python
import os
os.environ.pop('HTTP_PROXY', None)
os.environ.pop('HTTPS_PROXY', None)
os.environ.pop('ALL_PROXY', None)
```

3. **使用HTTP代理替代SOCKS**

---

## 飞书发图片正确方法（2026-03-03 23:37）

### 正确方法：使用message工具
```javascript
message({
  action: "send",
  channel: "feishu",
  filePath: "/path/to/image.jpg",
  target: "ou_xxx"  // 接收者ID
})
```

### ❌ 错误方法
直接用curl调飞书API，需要token，容易失效：
```bash
curl -X POST "https://open.feishu.cn/..." -H "Authorization: Bearer $TOKEN"
```

### 记住
发图片用 message 工具，不要用 curl 调飞书API！

---

## 飞书发图片卡片（2026-03-03 23:38 修正）

### 正确方法：使用message工具（默认就是卡片形式）
```javascript
message({
  action: "send",
  channel: "feishu",
  filePath: "/path/to/image.jpg",
  target: "ou_xxx"
})
```

### 之前错误认知纠正
- ❌ 之前说"用image而不是interactive"是错的
- ✅ message工具默认发送的就是卡片形式
- ✅ 不要用curl直接调飞书API（token容易失效）

### 记住
发图片/卡片统一用 message 工具！

---

## 飞书发图片 - 卡片形式（2026-03-03 23:40）

### 重要：要用卡片形式发！
- ❌ 不要发本地连接
- ✅ 要用卡片形式发出来

### 记住
发图片一定要用卡片形式！用 message 工具默认就是卡片形式！

---

## 飞书发图片完整方法（2026-03-03 23:46 补充）

### 正确方法：使用message工具（点点一直用的方法）
```javascript
message({
  action: "send",
  channel: "feishu",
  filePath: "/path/to/image.jpg",  // 本地图片路径
  target: "ou_xxx"  // 接收者ID
})
```

### 关键点
1. **filePath**: 使用本地图片路径，不是URL
2. **message工具**会自动：
   - 上传图片到飞书
   - 获取image_key
   - 用图片消息发送
3. **message工具发送的就是图片卡片形式**

### 本地路径白名单
飞书只允许从特定目录读取图片：
- /tmp
- /home/neomei/.openclaw/workspace/assets
- /home/neomei/.openclaw/workspace

### 豆豆哥教的
- 不要发本地连接（URL）
- 要用卡片形式发 → message工具默认就是卡片形式！

### 之前的问题
- 之前发的图片豆豆哥看不到 → 可能是路径或发送方式问题
- 用message工具从本地路径发送 → 成功！

---

## 飞书卡片发图片正确方法（2026-03-03 23:47）

### 正确的卡片发图片流程
```javascript
// 1. 上传图片获取image_key
const uploadRes = await client.im.image.create({
  data: { 
    image_type: 'message', 
    image: fileBuffer 
  },
});
const imageKey = uploadRes.image_key;

// 2. 用卡片发送（msg_type: "interactive"）
const cardContent = {
  config: { wide_screen_mode: true },
  header: {
    title: { tag: 'plain_text', content: '标题' },
    template: 'blue'  // 卡片颜色
  },
  elements: [
    {
      tag: 'img',
      img_key: imageKey  // 用上传获取的image_key
    }
  ]
};

await client.im.message.create({
  data: {
    receive_id: 'ou_xxx',
    msg_type: 'interactive',  // 关键：不是image，是interactive
    content: JSON.stringify(cardContent)
  }
});
```

### 关键点
- msg_type 要用 "interactive"（卡片）
- 先用 im.image.create 上传图片获取 image_key
- 卡片里用 img 标签 + image_key 显示图片

### 点点之前错的
- 直接用 msg_type="image" → 豆豆哥看不到
- 正确方式：用 msg_type="interactive" + 卡片里的img元素

---

## 发图片简化版（2026-03-03 23:49 补充）

### 简化的发图片方法（推荐）
```javascript
// 1. 上传图片
const uploadRes = await client.im.image.create({
  data: { image_type: 'message', image: fileBuffer },
});
const imageKey = uploadRes.image_key;

// 2. 用纯图片发送（msg_type="image"）
await client.im.message.create({
  data: {
    receive_id: 'ou_xxx',
    msg_type: 'image',  // 纯图片，不需要卡片！
    content: JSON.stringify({ image_key: imageKey })
  }
});
```

### 简化总结
- ✅ msg_type 用 "image"（纯图片）
- ✅ 不需要用 interactive 卡片
- ✅ 一样能显示图片

### 重要：生成图片要用参考图！
- 用 参考图的URL传给即梦 API
- 这样生成的图片才有参考图的效果！
