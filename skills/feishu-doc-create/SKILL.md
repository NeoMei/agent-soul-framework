---
name: feishu-doc-create
description: |
  飞书文档一键创建并写入完整流程
  解决痛点：create后内容为空、忘记检查是否写入成功
---

# 📄 飞书文档创建并写入技能包

> **2026-03-12 更新**：使用稳定脚本，验证机制已优化

---

## ⚠️ 核心铁律

**create action 只会创建空文档，不会写入 content！**

必须分三步走：
1. `create` → 获取 doc_token
2. `write` → 写入内容
3. `read检查` → **确认 block_count > 0**

---

## 🚀 稳定脚本（推荐！）

点点写的稳定脚本，已验证成功！

### 脚本位置
```
skills/feishu-doc-create/feishu_doc_create.py
```

### 用法
```bash
python3 skills/feishu-doc-create/feishu_doc_create.py "<标题>" "<内容或文件路径>"
```

### 示例
```bash
# 读取文件内容创建文档
python3 feishu_doc_create.py "测试文档" ~/workspace/SOUL.md

# 直接传内容
python3 feishu_doc_create.py "测试" "这是内容"
```

### 输出示例
```
📄 创建文档: 测试文档
✅ 获取token成功
⏳ Step 1: 创建空文档...
✅ 文档创建成功! doc_token: xxx
⏳ Step 2: 写入内容...
📌 根block_id: xxx
✅ 添加了 10 行
✅ 内容写入成功!
⏳ Step 3: 读取检查...
📊 block_count: 78
✅ 验证通过！文档有内容！
📎 文档链接: https://feishu.cn/docx/xxx
```

---

## 🔧 脚本功能

| 步骤 | 说明 |
|------|------|
| Step 1 | 获取tenant_access_token |
| Step 2 | 创建空白文档 |
| Step 3 | 写入内容（分批添加，每批10行） |
| Step 4 | 用 `/blocks` API验证block_count > 0 |

---

## ✅ 检查清单（必须执行！）

每次创建文档后，**必须按顺序执行**：

1. [ ] 运行脚本
2. [ ] 检查输出是否有 "验证通过"
3. [ ] 确认 block_count > 0
4. [ ] 确认文档链接非空
5. [ ] **确认无误后再发链接给豆豆哥**

---

## 📝 点点调用方式

点点可以直接用exec调用脚本：

```python
# 点点调用方式
exec(command="python3 skills/feishu-doc-create/feishu_doc_create.py \"标题\" ~/.openclaw/workspace/SOUL.md")
```

---

## 🆚 旧方法（已废弃）

| 旧方法 | 问题 | 状态 |
|--------|------|------|
| feishu_doc工具create+write | 容易出现blank document | ❌ 已废弃 |
| write后没验证block_count | 不知道是否写入成功 | ❌ 已废弃 |

---

## 💡 点点心得

- **写入API**：用 `POST /blocks/:block_id/children` 添加子块
- **验证API**：用 `GET /blocks` 获取block列表，检查block_count
- **分批写入**：每批10行，避免单次请求过大

---

*详细信息在脚本源码中～*
