# Agent Browser 命令映射

## 核心命令

| 命令 | 用途 | 示例 |
|------|------|------|
| `open <url>` | 打开网页 | `agent-browser open https://google.com` |
| `snapshot` | 捕获页面快照 | `agent-browser snapshot -i` |
| `snapshot -j` | JSON 格式快照 | `agent-browser snapshot -j > page.json` |
| `click <ref>` | 点击元素 | `agent-browser click @e1` |
| `type <ref> <text>` | 输入文本 | `agent-browser type @e2 "hello"` |
| `press <key>` | 按键 | `agent-browser press Enter` |
| `wait <ms>` | 等待毫秒 | `agent-browser wait 3000` |
| `wait --load <state>` | 等待加载状态 | `agent-browser wait --load networkidle` |
| `screenshot <file>` | 截图 | `agent-browser screenshot page.png` |
| `screenshot --full` | 全页截图 | `agent-browser screenshot full.png --full` |
| `close` | 关闭浏览器 | `agent-browser close` |

## 导航命令

| 命令 | 用途 |
|------|------|
| `back` | 后退 |
| `forward` | 前进 |
| `reload` | 刷新 |
| `goto <url>` | 跳转到 URL |

## 元素操作

| 命令 | 用途 | 示例 |
|------|------|------|
| `hover <ref>` | 悬停 | `agent-browser hover @e3` |
| `focus <ref>` | 聚焦 | `agent-browser focus @e4` |
| `select <ref> <value>` | 选择下拉框 | `agent-browser select @e5 "option1"` |
| `upload <ref> <path>` | 上传文件 | `agent-browser upload @e6 "/path/file.pdf"` |

## Cookie 和存储

| 命令 | 用途 |
|------|------|
| `cookie get <name>` | 获取 cookie |
| `cookie set <name> <value>` | 设置 cookie |
| `storage get <key>` | 获取 localStorage |
| `storage set <key> <value>` | 设置 localStorage |

## 高级选项

| 选项 | 说明 |
|------|------|
| `--json` | JSON 输出 |
| `--timeout <ms>` | 设置超时 |
| `--viewport <w>x<h>` | 设置视口 |
| `--headless` | 无头模式 |
| `--devtools` | 打开开发者工具 |
