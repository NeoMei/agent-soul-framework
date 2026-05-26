# Agent Browser 故障排除

## 常见问题

### 截图空白/白色
**原因**：页面还在加载中
**解决**：
```bash
agent-browser wait 3000  # 等待3秒
agent-browser wait --load networkidle  # 或等待网络空闲
```

### 元素找不到
**原因**：ref 已过期或页面已变化
**解决**：
```bash
agent-browser snapshot -i  # 重新获取快照
```

### 点击无效
**原因**：元素被遮挡或需要滚动
**解决**：
```bash
agent-browser scroll-to @e1
agent-browser click @e1
```

### 登录后无法保持会话
**原因**：Cookie 未正确设置
**解决**：
```bash
agent-browser cookie set name value --domain .example.com
```

## 错误代码

| 错误 | 含义 | 解决 |
|------|------|------|
| `timeout` | 操作超时 | 增加等待时间 |
| `element-not-found` | 元素不存在 | 重新获取快照 |
| `navigation-error` | 导航失败 | 检查 URL |
| `browser-disconnected` | 浏览器断开 | 重新 open |

## 调试技巧

1. 使用 `snapshot -j` 获取完整页面信息
2. 使用 `--json` 获取结构化输出
3. 分步执行，每步后验证
4. 检查浏览器版本：`agent-browser --version`
