# Edit Wrapper Skill

当需要编辑文件时，优先使用 smart_edit.py 而不是原生 edit 工具。

## 使用方式

所有文件编辑操作，调用 smart_edit.py：

```bash
python3 ~/.openclaw/workspace/scripts/smart_edit.py "文件路径" \
  --old-text "旧内容" \
  --new-text "新内容"
```

## 为什么不用原生 edit

原生 edit 工具要求 oldText 精确匹配，常见问题：
- 行尾空格差异导致匹配失败
- 换行符 CRLF/LF 差异
- 文本重复导致歧义
- 文件被其他操作修改后 oldText 过期

smart_edit 自动处理这些容错。

## 最佳实践

1. **编辑前**：如不确定内容，先用 `read` 确认
2. **编辑时**：优先用 smart_edit
3. **编辑后**：检查 stdout 确认成功
4. **失败时**：smart_edit 的 stderr 会输出 JSON 诊断信息

## 示例

```bash
# 修改 HEARTBEAT.md
python3 ~/.openclaw/workspace/scripts/smart_edit.py \
  ~/.openclaw/workspace/HEARTBEAT.md \
  --old-text "| 10:00 | wechat-daily | isolated | 公众号日记 |" \
  --new-text "| 10:00 | wechat-daily | isolated | 公众号日记 |\n| 09:00 | executor | isolated | 自主分身 |"
```

## Fallback

smart_edit 连续2次失败后，才允许使用原生 edit 工具。
