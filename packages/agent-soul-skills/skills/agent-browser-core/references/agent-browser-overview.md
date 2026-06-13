# Agent Browser 概览

## 什么是 Agent Browser

Agent Browser 是一个专为 AI Agent 设计的浏览器自动化 CLI 工具，基于 Rust 开发，支持：
- 快照（snapshot）- 捕获页面结构和元素引用
- Refs - 通过引用 ID 操作元素
- JSON 输出 - 便于程序解析

## 核心概念

### Snapshot（快照）
捕获页面的可访问性树，包含所有可交互元素及其引用 ID。

```bash
agent-browser snapshot -i  # 交互式快照
```

### Refs（引用）
元素的唯一标识符，格式为 `@e1`, `@e2` 等，用于精确定位元素。

### 工作流
1. Open - 打开网页
2. Snapshot - 获取页面结构
3. Act - 通过 ref 执行操作（点击、输入等）
4. Verify - 再次快照验证结果
5. Close - 关闭浏览器

## 安装检查

```bash
which agent-browser
agent-browser --version
```

## 基本命令

```bash
# 打开页面
agent-browser open https://example.com

# 获取快照
agent-browser snapshot -i

# 点击元素
agent-browser click @e1

# 输入文本
agent-browser type @e2 "hello world"

# 等待
agent-browser wait 3000

# 截图
agent-browser screenshot page.png

# 关闭
agent-browser close
```

## 安全提示

- 不要在没有批准的情况下使用 `--allow-file-access`
- 谨慎处理 cookies 和 credentials
- 避免在共享频道截图敏感信息
