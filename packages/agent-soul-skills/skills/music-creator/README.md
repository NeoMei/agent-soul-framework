# Music Creator

Suno 歌曲创作到发布的完整工作流：生成歌曲 → 下载 WAV 无损音频 → 发布到抖音音乐开放平台（汽水音乐）。

## 功能

- 🎵 **歌曲生成**：使用 Suno Advanced 模式自定义歌词、风格、人声性别
- 🎧 **WAV 下载**：自动触发后台生成无损音频并下载
- 🚀 **一键发布**：自动填写抖音音乐开放平台表单并提交

## 前置条件

### 1. 安装 OpenCLI

```bash
npm install -g @jackwener/opencli
```

### 2. 保持 Chrome 开启

所有操作通过 Chrome 桥接驱动浏览器完成。Chrome 必须保持开启且已登录：

- **Suno** (suno.com) — 需要 Premier 订阅才能生成 WAV
- **抖音音乐开放平台** (music.douyin.com) — 需要创作者账号

### 3. 安装 Adapters

将本仓库的 adapters 复制到 OpenCLI 的 clis 目录：

```bash
# 方法 1：手动复制
cp -r adapters/suno ~/.opencli/clis/
cp -r adapters/douyin-music ~/.opencli/clis/

# 方法 2：使用 install 脚本
chmod +x install.sh
./install.sh
```

### 4. 设置环境变量

```bash
# Suno 生成需要 3-7 分钟，默认超时不够
export OPENCLI_BROWSER_COMMAND_TIMEOUT=600
```

建议添加到 `~/.bashrc` 或 `~/.zshrc`。

## 快速开始

### 1. 生成歌曲

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=600 opencli suno create-advanced \
  --styles 'Chinese folk ballad, warm acoustic guitar, storytelling female vocal' \
  --lyrics '[Verse]\n两棵树在风雨里\n长成了彼此的形状' \
  --title '两棵树' \
  --vocal-gender female
```

**中文风格需要先翻译成英文**，否则会报 `TRANSLATE_REQUIRED` 错误。

### 2. 下载 WAV

```bash
# 使用 clip-id（上一步返回的）
opencli suno generate-wav <clip-id> --output-dir ~/Music/
```

### 3. 发布到抖音音乐

```bash
opencli douyin-music publish \
  --audio ~/Music/两棵树_<clip-id>.wav \
  --cover ~/Music/两棵树_<clip-id>_cover.jpeg \
  --title '两棵树' \
  --artist 'NeoMei' \
  --lyrics "$(cat ~/Music/两棵树_<clip-id>_lyrics.txt)" \
  --ai-tools Suno \
  --music-type 原创
```

## 完整工作流

```
suno create-advanced → generate-wav → douyin-music publish
```

详细参数说明见 [SKILL.md](SKILL.md)。

## 音频格式

| 格式 | 可用性 | 音质 | 文件大小 | 适用场景 |
|------|--------|------|----------|----------|
| **M4A** | ✅ 始终可用 | ⭐⭐⭐ 很好 | ~5MB | 推荐日常使用 |
| **MP3** | ✅ 始终可用 | ⭐⭐ 好 | ~3MB | 兼容性最好 |
| **WAV** | 🟡 需先生成 | ⭐⭐⭐⭐⭐ 无损 | ~40MB | 发布到音乐平台 |

抖音音乐开放平台要求 **WAV 格式**。

## 常见问题

### 1. `TRANSLATE_REQUIRED` 错误

`--styles` 包含中文。需要先翻译成英文：

```bash
# ❌ 错误
--styles '中国民谣，温暖木吉他'

# ✅ 正确
--styles 'Chinese folk ballad, warm acoustic guitar'
```

### 2. `AuthRequiredError` 错误

Chrome 中未登录 Suno 或抖音音乐。在 Chrome 中手动访问：
- `suno.com` — 登录
- `music.douyin.com` — 登录

### 3. WAV 下载 403

WAV 尚未生成。使用 `suno generate-wav` 命令会自动等待，或手动在 Suno Library 页面触发。

### 4. 发布失败

抖音音乐页面改版。检查：
1. 重新登录 `music.douyin.com`
2. URL 是否为 `https://music.douyin.com/console/complete-publish`
3. 添加 `--trace retain-on-failure` 查看调试信息

### 5. 生成超时

```bash
export OPENCLI_BROWSER_COMMAND_TIMEOUT=600  # 10 分钟
```

## 项目结构

```
music-creator/
├── SKILL.md                          # Skill 定义（AI agent 使用）
├── README.md                         # 本文件
├── install.sh                        # 一键安装脚本
└── adapters/
    ├── suno/
    │   ├── create-advanced.js        # 生成歌曲
    │   ├── generate-wav.js           # 下载 WAV
    │   ├── download.js               # 下载音频
    │   └── list.js                   # 列出歌曲
    └── douyin-music/
        └── publish.js                # 发布到抖音音乐
```

## 依赖

- [Node.js](https://nodejs.org/) ≥ 18
- [OpenCLI](https://github.com/jackwener/opencli) ≥ 1.7.0
- Google Chrome（保持开启）

## License

MIT
