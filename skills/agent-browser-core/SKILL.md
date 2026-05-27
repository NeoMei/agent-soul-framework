---
name: agent-browser-core
description: [DEPRECATED] 此技能已废弃。Migration后 agent-browser CLI 失效。请使用 skills/aily-browser/SKILL.md 中的 Playwright + 桌面 Chrome CDP 方案。
---

# Agent Browser Skill (Core) - 已废弃

> 🚨 **重要：此技能已废弃！**
> 
> Migration后，`agent-browser` CLI 因代理问题（`ALL_PROXY=socks://` 导致 `ERR_NO_SUPPORTED_PROXIES`）和无法连接桌面 Chrome 而失效。
> 
> **请使用新方案：**
> ```bash
> # 读新技能文档
> read skills/aily-browser/SKILL.md
> 
> # 用户启动 Chrome
> google-chrome --remote-debugging-port=9222
> 
> # 点点用 browser-controller.js 操作
> node skills/aily-browser/scripts/browser-controller.js navigate https://www.example.com
> node skills/aily-browser/scripts/browser-controller.js snapshot
> node skills/aily-browser/scripts/browser-controller.js screenshot /tmp/page.png
> ```

## 为什么废弃

1. `agent-browser open` 报错 `net::ERR_NO_SUPPORTED_PROXIES`
2. `agent-browser connect 9222` 无法真正连接到用户桌面 Chrome（总是创建新实例）
3. 系统环境变化后，无头模式 Chrome 页面 DOM 不加载

## 替代方案

| 旧方式 | 新方式 |
|--------|--------|
| `agent-browser open URL` | `node browser-controller.js navigate URL` |
| `agent-browser snapshot -i` | `node browser-controller.js snapshot` |
| `agent-browser click @e1` | `node browser-controller.js click "@e1"` |
| `agent-browser screenshot x.png` | `node browser-controller.js screenshot /tmp/x.png` |
| `agent-browser eval "js"` | `node browser-controller.js eval "js"` |
| `agent-browser close` | `node browser-controller.js close` |

**详细用法见 `skills/aily-browser/SKILL.md`**
