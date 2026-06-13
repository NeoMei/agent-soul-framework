---
name: music-creator
description: Suno 歌曲创作完整工作流：生成歌曲 → 下载 WAV → 发布到抖音音乐开放平台。支持自定义歌词、风格、人声性别，自动触发 WAV 无损生成，并支持一键发布到汽水音乐。
allowed-tools: Bash(opencli:*), Read, Edit, Write
---

# Suno 歌曲创作完整工作流

本 skill 覆盖从歌曲生成到发布的完整链路：

```
创作歌曲 (suno create-advanced)
    ↓
下载 WAV 无损音频 (suno generate-wav)
    ↓
发布到抖音音乐 (douyin-music publish)
```

**目标**：零配置、全自动化，一次命令完成从创意到发布的全过程。

---

## 前置条件

1. **Chrome 浏览器保持开启**，且已登录：
   - Suno (suno.com) — 需要 Premier 订阅才能生成 WAV
   - 抖音音乐开放平台 (music.douyin.com) — 需要创作者账号

2. **环境变量设置**（Suno 生成需要 3-7 分钟）：
   ```bash
   export OPENCLI_BROWSER_COMMAND_TIMEOUT=600
   ```

3. **WAV 生成需要 Suno Pro/Premier 订阅**，免费版无法生成 WAV。

---

## 工作流

### Step 1: 创作歌曲

使用 `suno create-advanced` 生成歌曲，每次消耗 10 积分，产出 2 个版本。

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=600 opencli suno create-advanced \
  --styles '<英文风格描述>' \
  --lyrics '<歌词>' \
  --title '<标题>' \
  --vocal-gender male|female \
  --lyrics-mode manual|auto
```

#### 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `--styles` | 是 | 风格描述，**必须是英文**。自然语言长文本，如 `"Chinese folk ballad, warm acoustic guitar"` |
| `--lyrics` | 是（或 `--instrumental`） | 完整歌词，可含 `[Verse]/[Chorus]` 标签 |
| `--title` | 否 | 歌曲标题 |
| `--vocal-gender` | 否 | `male` / `female` |
| `--lyrics-mode` | 否 | `manual`（手动分段）/ `auto`（自动分段） |
| `--instrumental` | 否 | 纯音乐模式（与 `--lyrics` 互斥） |

#### 中文处理

**如果用户用中文描述风格，必须先翻译成英文再调用**。直接传中文会返回 `TRANSLATE_REQUIRED` 错误。

```bash
# ❌ 错误
--styles '中国民谣，温暖木吉他'

# ✅ 正确
--styles 'Chinese folk ballad, warm acoustic guitar'
```

#### 返回结果

成功后会返回 2 个版本：

```yaml
- id: "clip-id-1"
  title: "歌曲标题"
  audio_url: "https://cdn1.suno.ai/clip-id-1.mp3"
  image_url: "https://cdn2.suno.ai/image_clip-id-1.jpeg"
  duration: 180
  status: complete

- id: "clip-id-2"
  title: "歌曲标题"
  audio_url: "https://cdn1.suno.ai/clip-id-2.mp3"
  image_url: "https://cdn2.suno.ai/image_clip-id-2.jpeg"
  duration: 180
  status: complete
```

**保存这两个 clip-id**，后续下载和发布都需要。

---

### Step 2: 下载 WAV 无损音频

Suno 默认只生成 MP3/M4A，**WAV 需要额外触发后台生成**。

#### 快速下载（推荐）

```bash
# 自动触发 WAV 生成并下载（等待 10-30 秒）
opencli suno generate-wav <clip-id> --output-dir ~/Music/
```

**流程**：
1. 打开 Suno Library 页面 (`suno.com/me`)
2. 找到对应歌曲，右键 "More options"
3. 悬停 "Download" → 点击 "WAV Audio"
4. 在对话框中点击 "Download File" 触发后台生成
5. 等待 10 秒，从 CDN 下载生成的 WAV 文件

#### 手动分步下载

如果自动流程失败，可以手动分步：

```bash
# 1. 先下载 MP3（立即可用）
opencli suno download <clip-id> --audio-format mp3

# 2. 触发 WAV 生成
opencli suno generate-wav <clip-id>

# 3. 或直接用 CDN 链接（生成后可用）
# WAV: https://cdn1.suno.ai/<clip-id>.wav
# M4A: https://cdn1.suno.ai/<clip-id>.m4a（音质最好，始终可用）
# MP3: https://cdn1.suno.ai/<clip-id>.mp3（始终可用）
```

#### 音频格式对比

| 格式 | 可用性 | 音质 | 文件大小 | 适用场景 |
|------|--------|------|----------|----------|
| **M4A** | ✅ 始终可用 | ⭐⭐⭐ 很好 | ~5MB | 推荐日常使用 |
| **MP3** | ✅ 始终可用 | ⭐⭐ 好 | ~3MB | 兼容性最好 |
| **WAV** | 🟡 需先生成 | ⭐⭐⭐⭐⭐ 无损 | ~40MB | 发布到音乐平台 |

**抖音音乐开放平台要求 WAV 格式**，所以发布前必须生成 WAV。

---

### Step 3: 发布到抖音音乐开放平台

使用 `douyin-music publish` 将歌曲发布到汽水音乐（抖音音乐开放平台）。

```bash
opencli douyin-music publish \
  --audio-file </path/to/song.wav> \
  --title '<歌曲标题>' \
  --artist '<表演者>' \
  --lyrics-file </path/to/lyrics.txt> \
  --cover-file </path/to/cover.jpeg> \
  --ai-tools Suno \
  --music-type original
```

#### 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `--audio-file` | 是 | WAV 音频文件路径（无损格式） |
| `--title` | 是 | 歌曲标题 |
| `--artist` | 是 | 表演者/歌手名称 |
| `--lyrics-file` | 否 | 歌词文件路径（.txt 或 .lrc） |
| `--cover-file` | 否 | 封面图片路径（.jpeg/.jpg/.png） |
| `--ai-tools` | 否 | 使用的 AI 工具：`Suno` / `Udio` / `天音` / `海绵音乐` / `腾讯启明星` / `天工AI` / `Mureka` / `其他`。Suno 作品填 `Suno` |
| `--music-type` | 否 | 音乐类型：`original`（原创）/ `original-instrumental`（原创伴奏）/ `cover`（翻唱）/ `remix`（Remix）。默认 `original` |
| `--album-name` | 否 | 专辑名称 |
| `--album-artist` | 否 | 专辑歌手 |
| `--album-cover` | 否 | 专辑封面 |
| `--label` | 否 | 厂牌/唱片公司 |
| `--release-date` | 否 | 期望发行时间（YYYY-MM-DD） |
| `--already-released` | 否 | 是否已发行：`true` / `false`。默认 `false` |
| `--clip-file` | 否 | 歌曲片段文件（用于试听） |
| `--edit-file` | 否 | 剪辑版文件 |
| `--auth-file` | 否 | 授权证明文件 |

#### 发布页面自动填写

Adapter 会自动在抖音音乐发布页面 (`music.douyin.com/console/complete-publish`) 完成：
1. ✅ AI创作声明：自动勾选「是」
2. ✅ 使用的AI工具：自动选择「Suno」
3. ✅ 音乐类型：自动选择「原创」
4. ✅ 上传完整版音频（WAV）
5. ✅ 填写歌曲标题、表演者、词作者、曲作者
6. ✅ 粘贴歌词
7. ✅ 上传封面图
8. ✅ 点击提交

---

## 完整工作流示例

### 示例 1：完整流程（从生成到发布）

```bash
# Step 1: 生成歌曲
OPENCLI_BROWSER_COMMAND_TIMEOUT=600 opencli suno create-advanced \
  --styles 'Chinese folk ballad, warm acoustic guitar, storytelling female vocal' \
  --lyrics '[Verse]\n两棵树在风雨里\n长成了彼此的形状\n[Chorus]\n我们是两棵树\n根在地下紧紧缠绕' \
  --title '两棵树' \
  --vocal-gender female \
  --lyrics-mode manual

# 记录返回的 clip-id（假设是 45fdb007-bcd4-485f-9a7c-4b38f8d96324）

# Step 2: 下载 WAV
opencli suno generate-wav 45fdb007-bcd4-485f-9a7c-4b38f8d96324 \
  --output-dir ~/Music/

# Step 3: 发布到抖音音乐
opencli douyin-music publish \
  --audio-file ~/Music/两棵树_45fdb007-bcd4-485f-9a7c-4b38f8d96324.wav \
  --title '两棵树' \
  --artist 'NeoMei' \
  --lyrics-file ~/Music/两棵树_45fdb007-bcd4-485f-9a7c-4b38f8d96324_lyrics.txt \
  --cover-file ~/Music/两棵树_45fdb007-bcd4-485f-9a7c-4b38f8d96324_cover.jpeg \
  --ai-tools Suno \
  --music-type original
```

### 示例 2：只下载不发布

```bash
# 下载两个版本的 WAV
opencli suno generate-wav <clip-id-1> --output-dir ~/Music/
opencli suno generate-wav <clip-id-2> --output-dir ~/Music/
```

### 示例 3：批量发布多首歌曲

```bash
# 创建批量发布脚本
for clip_id in "id1" "id2" "id3"; do
  echo "Publishing $clip_id..."
  opencli douyin-music publish \
    --audio-file ~/Music/${clip_id}.wav \
    --title "Song $clip_id" \
    --artist "NeoMei" \
    --ai-tools Suno \
    --music-type original
done
```

---

## 常见问题

### Q1: `TRANSLATE_REQUIRED` 错误

**原因**：`--styles` 参数包含中文。  
**解决**：先将中文风格翻译成英文再调用。

```bash
# ❌ 错误
--styles '中国民谣，温暖木吉他'

# ✅ 正确
--styles 'Chinese folk ballad, warm acoustic guitar'
```

### Q2: `AuthRequiredError` 错误

**原因**：Chrome 中 Suno 或抖音音乐未登录。  
**解决**：
1. 在 Chrome 中打开 `suno.com` 并登录
2. 在 Chrome 中打开 `music.douyin.com` 并登录
3. 重新运行命令

### Q3: WAV 下载失败 / 403 错误

**原因**：WAV 尚未生成完成。  
**解决**：
1. 使用 `suno generate-wav` 命令（会自动等待生成）
2. 或手动在 Suno Library 页面点击 "Download → WAV Audio" 触发
3. 等待 10-30 秒后重试

### Q4: 抖音音乐发布失败 / 页面元素找不到

**原因**：抖音音乐页面改版或登录态过期。  
**解决**：
1. 在 Chrome 中重新登录 `music.douyin.com`
2. 检查页面 URL 是否为 `https://music.douyin.com/console/complete-publish`
3. 如果页面结构大幅改版，需要更新 adapter

### Q5: Suno 生成超时

**原因**：歌曲生成需要 3-7 分钟，默认超时时间不够。  
**解决**：
```bash
export OPENCLI_BROWSER_COMMAND_TIMEOUT=600  # 10 分钟
```

---

## 文件输出结构

下载完成后，输出目录包含：

```
~/Music/
├── 两棵树_45fdb007-bcd4-485f-9a7c-4b38f8d96324.wav       # 无损音频
├── 两棵树_45fdb007-bcd4-485f-9a7c-4b38f8d96324.mp3       # MP3 版本
├── 两棵树_45fdb007-bcd4-485f-9a7c-4b38f8d96324_cover.jpeg # 封面图
└── 两棵树_45fdb007-bcd4-485f-9a7c-4b38f8d96324_lyrics.txt # 歌词文本
```

---

## 高级技巧

### 批量生成歌曲

```bash
# 创建批量生成脚本
styles="Chinese folk ballad, warm acoustic guitar"
for i in {1..5}; do
  echo "Generating song $i..."
  OPENCLI_BROWSER_COMMAND_TIMEOUT=600 opencli suno create-advanced \
    --styles "$styles" \
    --lyrics "Song $i lyrics here..." \
    --title "Song $i"
done
```

### 自动翻译风格

如果用户坚持用中文描述风格，你可以先用 LLM 翻译：

```bash
# 用户输入："中国民谣，温暖木吉他，叙事女声"
# 翻译后："Chinese folk ballad, warm acoustic guitar, storytelling female vocal"
```

### 使用 M4A 作为预览

M4A 音质优于 MP3 且文件更小，适合快速预览：

```bash
opencli suno download <clip-id> --audio-format m4a
```

---

## 关键约定

- **Chrome 必须保持开启**：所有命令都通过 Chrome 桥接驱动浏览器
- **Suno 需要 Premier 订阅**：免费版无法生成 WAV
- **抖音音乐需要创作者账号**：普通用户无法发布
- **每次生成消耗 10 credits**：产出 2 个版本
- **WAV 生成是异步的**：需要 10-30 秒等待时间
- **文件命名格式**：`<title>_<clip-id>.<ext>`

---

## 故障排查

如果整个工作流卡住：

1. **检查 Chrome 是否开启**：`opencli doctor`
2. **检查登录状态**：在 Chrome 中手动访问 `suno.com` 和 `music.douyin.com`
3. **检查订阅状态**：Suno 账户是否显示 "Premier"
4. **检查网络**：CDN 链接是否可访问 `curl -I https://cdn1.suno.ai/<clip-id>.wav`
5. **查看 trace**：加 `--trace retain-on-failure` 保留调试信息

---

## 参考命令速查

```bash
# 生成歌曲
opencli suno create-advanced --styles '<英文风格>' --lyrics '<歌词>' --title '<标题>'

# 下载 WAV
opencli suno generate-wav <clip-id> --output-dir ~/Music/

# 下载 MP3/M4A
opencli suno download <clip-id> --audio-format mp3|m4a|wav

# 发布到抖音音乐
opencli douyin-music publish --audio-file <path> --title '<标题>' --artist '<歌手>'

# 列出所有歌曲
opencli suno list --limit 20

# 检查环境
opencli doctor
```
