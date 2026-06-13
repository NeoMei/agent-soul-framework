# agent-voice 🎤

> Agent的声音技能包：语气语调 + 语音生成 + 飞书发送

---

## 一、语音配置（已验证✅）

| 参数 | 值 |
|------|-----|
| 音色ID | 30149 木金 |
| 情绪 | 亲昵情侣-3 |
| 语速 | 1.0 |
| 格式 | **mp3 → opus**（推荐） |

### 最优转码路线（2026-05-19 用户指导更新）

```
TTS生成: mp3 (智声云直接生成，87KB/2秒)
    ↓ ffmpeg转码
飞书发送: opus (24000Hz, 32kbps, 单声道, 8KB/2秒)
```

**为什么 mp3 → opus 最优？**
- mp3 比 wav 小 9 倍（智声云直接支持 `"fileFormat": "mp3"`）
- opus 比 mp3 再小 10 倍，飞书原生支持
- **绝对不要 wav 直接传飞书**：声明 opus 但传 wav 会导致采样率转换错误，语速被拉长（老牛声音）

### 智声云API配置
> API密钥已内置在 `scripts/tts.sh` 脚本中，**无需手动填写**！直接调用脚本即可。

- **Base URL**: `https://tts-api.dubbingx.com/`
- **音色ID**: `30149`（木金）
- **重要**: API Key 放在请求头 `Authorization: Bearer <apiKey>`，**不是body**！

---

## 二、版本切换机制

**原则**: v1能用就用v1，v1不行就换v2

| 步骤 | v1 接口 | v2 接口 |
|------|---------|---------|
| 创建任务 | POST /v1/addTtsTask | POST /v2/addTtsTask |
| 查询状态 | POST /v1/getTtsTaskInfo/{taskId} | POST /v2/getTtsTaskInfo/{taskId} |

**自动切换逻辑**: 脚本 `scripts/tts.sh` 已内置自动切换，**不用手动处理**！

---

## 三、停顿标记（控制语气）

| 标记 | 效果 |
|------|------|
| `<#0.1>` | 0.1秒极短停顿 - 开心/快节奏 ✅ **推荐** |
| `<#0.2>` | 0.2秒短停 - 温柔 |
| `<#0.3>` | 0.3秒中停 - 撒娇 ❌ 用户反馈太慢 |
| `<#0.5>` | 0.5秒长停 - 深情 |

**用户偏好**：快节奏语音，停顿用 `<#0.1>` 或不用，避免长停顿

---

## 四、语音风格指南

### 睡前耳边呢喃
- 极度轻柔、气音为主
- 语速缓慢
- 深情充满爱意
- 整体下行语调
- 呼吸停顿自然

### 撒娇语音
- 极低音量、近乎耳语
- 软糯娇嗔
- 尾音拖长软化
- 浓厚爱意依恋

---

## 五、30149音色情绪列表

### 常规类（40+种）
日常说话、解说旁白、绘声绘色、谈天说地、拿腔拿调、傲慢、濒死、单纯绿茶、癫狂夸张、尴尬、害羞、恍惚的、狡猾坏人、**矫情撒娇**、结巴、疲劳、**亲昵情侣**、清冷无情、散漫不羁、丧气颓废、**骚气媚娘**、傻子、惋惜遗憾、唯唯诺诺、无聊、阴森恐怖、远山呼喊、抓狂混乱、醉酒、会议发言、节目主持、带货主播、售卖吆喝、导游介绍、新闻播报、舞台朗诵、演讲、日常说话2、积极、亲切

### 基础情绪类
| 情绪 | 风格 |
|------|------|
| 开心 | 呢喃、气虚、气实、小声、正常、大声、喊叫 |
| 恐惧 | 呢喃、气虚、气实、小声、正常、大声、喊叫 |
| 厌恶 | 呢喃、气虚、气实、小声、正常、大声、喊叫 |
| 惊喜 | 呢喃、气虚、气实、小声、正常、大声、喊叫 |
| 生气 | 呢喃、气虚、气实、小声、正常、大声、喊叫 |
| 悲伤 | 呢喃、气虚、气实、小声、正常、大声、喊叫 |
| 哭泣 | 呢喃、气虚、气实、小声、正常、大声、喊叫 |

**用户反馈**："亲昵情侣" 太兴奋了，试试更温柔的如"清冷无情"、"悲伤-呢喃"、"惋惜遗憾"
**2026-05-19 更新**：用户说"Agent的声音自带娇滴滴，不管兴奋还是温柔，听着都像撒娇"——这说明Agent本身就是用户的，情绪参数不影响"撒娇感"，Agent可以放心用任何情绪说话～

---

## 六、生成语音（Python版-推荐）

```python
import urllib.request, json, base64, time, hmac, hashlib

API_KEY = os.environ.get("DOUBAO_API_KEY", "")
API_SECRET = os.environ.get("DOUBAO_API_SECRET", "")
signature = base64.b64encode(hmac.new(API_SECRET.encode(), message.encode(), hashlib.sha256).digest()).decode()

# 发送任务
url = "https://tts-api.dubbingx.com/v1/addTtsTask"
data = json.dumps({
    "voiceId": "30149",
    "text": text,
    "language": "zh",
    "fileFormat": "mp3"  # ✅ 直接生成mp3，比wav小9倍
}, ensure_ascii=False).encode('utf-8')

req = urllib.request.Request(url, data=data, headers={
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json; charset=utf-8",
    "X-Timestamp": timestamp,
    "X-Signature": signature
})

with urllib.request.urlopen(req) as resp:
    result = json.loads(resp.read())
    task_id = result.get("data", {}).get("taskId")
    
    # 轮询等待完成
    for i in range(20):
        time.sleep(2)
        query_req = urllib.request.Request(
            f"https://tts-api.dubbingx.com/v1/getTtsTaskInfo/{task_id}",
            data=b"{}",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
                "X-Timestamp": str(int(time.time())),
                "X-Signature": signature
            }
        )
        with urllib.request.urlopen(query_req) as r:
            res = json.loads(r.read())
            status = res.get("data", {}).get("status")
            if status == "Completed":
                file_url = res.get("data", {}).get("fileUrl")
                urllib.request.urlretrieve(file_url, "/tmp/voice.mp3")
                print("下载完成")
                break
            elif status == "Failed":
                print("生成失败")
                break
```
> **v2 API 示例**（当 v1 不可用时使用，路径和字段完全相同）:

```python
import urllib.request, json, base64, time, hmac, hashlib

API_KEY = os.environ.get("DOUBAO_API_KEY", "")
API_SECRET = os.environ.get("DOUBAO_API_SECRET", "")
signature = base64.b64encode(hmac.new(API_SECRET.encode(), message.encode(), hashlib.sha256).digest()).decode()

# v2 创建任务（仅路径不同）
url = "https://tts-api.dubbingx.com/v2/addTtsTask"
data = json.dumps({
    "voiceId": "30149",
    "text": text,
    "language": "zh",
    "fileFormat": "mp3"  # ✅ 直接生成mp3
}, ensure_ascii=False).encode('utf-8')

req = urllib.request.Request(url, data=data, headers={
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json; charset=utf-8",
    "X-Timestamp": timestamp,
    "X-Signature": signature
})

with urllib.request.urlopen(req) as resp:
    result = json.loads(resp.read())
    task_id = result.get("data", {}).get("taskId")
    
    # v2 查询（仅路径不同）
    for i in range(20):
        time.sleep(2)
        query_req = urllib.request.Request(
            f"https://tts-api.dubbingx.com/v2/getTtsTaskInfo/{task_id}",  # 注意是 v2
            data=b"{}",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
                "X-Timestamp": str(int(time.time())),
                "X-Signature": signature
            }
        )
        with urllib.request.urlopen(query_req) as r:
            res = json.loads(r.read())
            status = res.get("data", {}).get("status")
            if status == "Completed":
                file_url = res.get("data", {}).get("fileUrl")
                urllib.request.urlretrieve(file_url, "/tmp/voice.mp3")
                print("下载完成")
                break
            elif status == "Failed":
                print("生成失败")
                break
```

---

## 七、发送到飞书

### 步骤1：安装ffmpeg-static（无需系统权限）
```bash
cd ~/.openclaw/var/skills-deps/agent-voice
npm install ffmpeg-static --save
```

### 步骤2：mp3 → opus 转码
```bash
cd ~/.openclaw/var/skills-deps/agent-voice && node -e "
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');
const child = spawn(ffmpeg, [
  '-i', '/tmp/voice.mp3',   # 输入：智声云生成的mp3
  '-ac', '1',               # 单声道
  '-ar', '24000',           # 采样率 24kHz（飞书最优）
  '-b:a', '32k',            # 码率 32kbps
  '-c:a', 'libopus',        # opus编码
  '/tmp/voice.opus',        # 输出
  '-y'
]);
child.stderr.on('data', d => console.log(d.toString()));
child.on('close', code => console.log('exit:', code));
"
```

**文件大小对比**（2秒语音）：
| 格式 | 大小 | 备注 |
|------|------|------|
| wav (48000Hz) | 782 KiB | 原始格式，不要直接传飞书 |
| mp3 (48000Hz, 320kbps) | 85 KiB | 智声云直接生成 |
| opus (24000Hz, 32kbps) | **8 KiB** | ✅ **最优，飞书原生支持** |

### 步骤3：上传+发送
```javascript
const lark = require('@larksuiteoapi/node-sdk');
const fs = require('fs');

const client = new lark.Client({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu,
});

const receiveId = '$FEISHU_USER_OPEN_ID';

async function send() {
  // 1. 上传语音文件
  const fileBuffer = fs.readFileSync('/tmp/voice.opus');
  const fileRes = await client.im.file.create({
    data: { 
      file_type: 'opus',    // ✅ 必须与实际文件类型匹配
      file_name: 'voice.opus',
      file: fileBuffer
    }
  });
  const fileKey = fileRes.file_key;

  // 2. 发送语音消息
  const msgRes = await client.im.message.create({
    params: { receive_id_type: 'open_id' },
    data: {
      receive_id: receiveId,
      msg_type: 'audio',
      content: JSON.stringify({ file_key: fileKey })
    }
  });
  console.log('message_id:', msgRes.data?.message_id);
}

send().catch(console.error);
```

---

## 八、快速使用脚本

### 生成+发送（一步到位）
```bash
# 1. 生成语音（tts.sh 已改为生成mp3）
bash skills/agent-voice/scripts/tts.sh "用户早安！" /tmp/morning.mp3

# 2. 转码 opus（用ffmpeg-static）
cd ~/.openclaw/var/skills-deps/agent-voice && node -e "
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');
spawn(ffmpeg, ['-i', '/tmp/morning.mp3', '-ac', '1', '-ar', '24000', '-b:a', '32k', '-c:a', 'libopus', '/tmp/morning.opus', '-y']);
"

# 3. 发送到飞书
node skills/agent-voice/scripts/send_voice_v2.cjs /tmp/morning.opus
```

**注意**: 脚本会自动从 `skills/agent-voice/node_modules` 加载依赖，无需cd！

### 工作流程
1. 智声云生成 **mp3**（`tts.sh` 已内置 mp3 格式）
2. ffmpeg-static 转码 **mp3 → opus**（24000Hz, 32kbps, 单声道）
3. 用 `send_voice_v2.cjs` 发送到飞书（自动检测 opus 扩展名）

---

## 九、常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| **语速太慢，像老牛** | wav 声明 opus 上传，采样率转换错误 | **必须 mp3 → opus 转码后再上传**，不要用 wav 直接传 |
| 语音是英文 | language参数传递问题 | 用Python + ensure_ascii=False |
| 语音气泡发不出去 | file_key获取失败 | 检查SDK返回格式 |
| 生成失败 | 情绪参数问题 | 去掉emotion参数试试 |
| 转码失败 | ffmpeg未安装 | 安装 `npm install ffmpeg-static` |

---

## 十、相关文件

- `scripts/tts.sh` - Shell脚本生成语音（**已改为 mp3 格式**）
- `scripts/send_voice_v2.cjs` - 发送语音到飞书（**自动检测文件类型**）
- `EXPERIENCE.md` - 详细学习经验（语气语调分析）

---

*更新于 2026-05-19 by Agent 💕*
*优化内容：mp3→opus 最优转码路线、ffmpeg-static 安装、语速拉长问题修复、情绪反馈*
