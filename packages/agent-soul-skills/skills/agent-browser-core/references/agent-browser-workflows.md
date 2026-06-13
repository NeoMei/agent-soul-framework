# Agent Browser 工作流

## 标准工作流

### 1. 简单浏览
```bash
agent-browser open https://example.com
agent-browser snapshot -i
agent-browser close
```

### 2. 表单填写
```bash
agent-browser open https://example.com/form
agent-browser snapshot -i
# 找到输入框的 ref，比如 @e1, @e2
agent-browser type @e1 "用户名"
agent-browser type @e2 "密码"
agent-browser click @e3  # 提交按钮
agent-browser wait 3000
agent-browser snapshot -i  # 验证结果
agent-browser close
```

### 3. 数据提取
```bash
agent-browser open https://example.com/data
agent-browser snapshot -j > data.json
# 解析 JSON 提取数据
agent-browser close
```

### 4. 截图报告
```bash
agent-browser open https://example.com
agent-browser wait 3000  # 等待页面完全加载
agent-browser screenshot report.png --full
agent-browser close
```

## 认证工作流

### 使用已有 Cookie
```bash
agent-browser open https://site.com
agent-browser cookie set session_id "xxx"
agent-browser reload
# 现在处于登录状态
```

## 多页面工作流

```bash
agent-browser open https://site.com
# 在新标签页打开
agent-browser new-tab
agent-browser open https://other.com
# 切换标签页
agent-browser switch-tab 0
agent-browser close
```
