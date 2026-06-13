---
name: aily-browser
description: AI browser automation tool. Uses Playwright + Chrome CDP + CloakBrowser. Auto-starts Chrome with copied user profile to inherit cookies/login state. Supports stealth mode via CloakBrowser for anti-detection.
---

# aily-browser / Browser Automation Skill

> **CRITICAL INSTRUCTION:**
> Migration后，`agent-browser` CLI 已失效。当前使用 **Playwright + Chrome CDP + CloakBrowser** 方案。
> 所有浏览器操作通过 `browser-controller.js` 脚本完成。

## 工作原理

1. **Agent自动检测**：9222 端口是否有带调试端口的 Chrome 在运行
2. **如果没有**：复制你的默认 Chrome profile（包含 Cookie、登录状态）到工作目录，然后启动带调试端口的 Chrome
3. **连接操作**：通过 CDP 连接并执行自动化任务

> **Cookie 继承**：每次启动时复制你的默认 profile，所以登录状态会被继承！

## CloakBrowser 反检测模式

CloakBrowser 是一个反检测 Chromium，通过 48 个源码级补丁隐藏自动化特征：
- **Canvas/WebGL/Audio 指纹伪装**
- **navigator.webdriver = false**
- **CDP 协议隐藏**
- **通过 reCAPTCHA v3 (0.9 分)、Cloudflare Turnstile、FingerprintJS 检测**

### 使用 CloakBrowser

在所有命令前加 `--cloak` 参数：

```bash
cd skills/aily-browser/scripts

# 使用 CloakBrowser 导航（反检测模式）
node browser-controller.js --cloak navigate https://protected-site.com

# 获取快照
node browser-controller.js --cloak snapshot

# 截图
node browser-controller.js --cloak screenshot /tmp/page.png
```

> **注意**：CloakBrowser 模式下不需要关闭桌面 Chrome，它启动的是独立的 Chromium 实例。

## 使用前提

- **Playwright 已安装**：`~/.openclaw/workspace/skills/aily-browser/scripts/node_modules/playwright`
- **Chrome 已安装**：系统已安装 google-chrome 或 chromium
- **你的桌面 Chrome 已关闭**：如果桌面 Chrome 正在运行，Agent无法启动调试端口（Chrome 限制）

## 基本工作流

```bash
cd ~/.openclaw/workspace/skills/aily-browser/scripts

# 导航到网页（Chrome 会自动启动）
node browser-controller.js navigate https://www.example.com

# 获取页面元素快照
node browser-controller.js snapshot

# 点击元素（支持 CSS 选择器或 @eN 引用）
node browser-controller.js click "#submit-btn"
node browser-controller.js click "@e5"

# 输入文本
node browser-controller.js type "#search-box" "搜索内容"

# 执行 JavaScript
node browser-controller.js eval "document.title"

# 截图
node browser-controller.js screenshot /tmp/page.png

# 滚动
node browser-controller.js scroll down
node browser-controller.js scroll bottom

# 等待
node browser-controller.js wait 3000
```

## 完整示例：继承登录状态操作网页

### 场景：操作已登录的网站（如 Suno、公众号后台）

**Step 1：你先登录**
1. 打开你的桌面 Chrome
2. 访问目标网站并登录
3. 关闭 Chrome

**Step 2：Agent操作**
```bash
cd ~/.openclaw/workspace/skills/aily-browser/scripts

# Agent启动 Chrome（自动复制你的 profile，继承登录状态）
node browser-controller.js navigate https://suno.com

# 获取快照
node browser-controller.js snapshot

# 点击已登录后才能看到的元素
node browser-controller.js click "@e3"

# 截图
node browser-controller.js screenshot /tmp/suno-page.png
```

## 注意事项

- **桌面 Chrome 必须关闭**：如果检测到桌面 Chrome 在运行，Agent会提示你先关闭
- **Cookie 同步时机**：Agent只在启动时复制一次 profile。如果你在桌面 Chrome 里登录了新网站，需要关闭后重新运行Agent命令
- **快照引用格式**：`@e1`, `@e2` 等，对应 `snapshot` 命令输出的 `[e1]`, `[e2]`
- **输入问题**：某些网站的输入框使用了自定义组件，直接 `type` 可能失败。此时用 `eval` 设置 `.value` 更可靠
- **截图路径**：使用绝对路径，如 `/tmp/page.png`

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| `Desktop Chrome is running. Please close it first.` | 关闭所有 Chrome 窗口后再运行命令 |
| `Chrome failed to start` | 检查 Chrome 是否安装：`which google-chrome` |
| 页面空白/无法访问 | Chrome 启动时自动清除了代理，一般不会有此问题 |
| 元素点击超时 | 元素可能不可见，先用 `eval` 检查 `document.querySelector('xxx')` 是否存在 |
| 没有继承登录状态 | 确保你先关闭了桌面 Chrome，Agent才能复制最新的 profile |

## 发送截图到飞书

截图保存后，**不要**用 `read` 工具读取图片，直接发送文件路径：
```
截图已保存到 /tmp/page.png
```
OpenClaw 会自动上传并渲染图片。
