# 模型热切换 🔄

> 在飞书对话中查看可用模型并切换，无需重启服务

---

## 触发条件

用户说以下内容时，读取本技能包：
- "切换模型"、"换个模型"、"用什么模型"
- "有哪些模型"、"模型列表"
- "换成 xxx"（xxx 是模型名）

---

## API 说明

OpenCode server 运行在 `http://localhost:19876`，需要 Basic Auth。

```bash
AUTH="Basic $(echo -n "opencode:$OPENCODE_SERVER_PASSWORD" | base64)"
```

### 1. 查看当前模型

```bash
python3 -c "import json; print(json.load(open('.opencode/opencode.json')).get('model','未设置'))"
```

### 2. 列出已连接的模型

```bash
curl -s -H "Authorization: $AUTH" -H "Accept: application/json" \
  http://localhost:19876/provider | python3 -c "
import sys,json
d=json.load(sys.stdin)
connected = set(d.get('connected',[]))
for p in d.get('all',[]):
    if p['id'] in connected:
        models = p.get('models', {})
        ids = list(models.keys()) if isinstance(models, dict) else []
        print(f\"**{p['id']}**: {', '.join(ids[:8])}\")
"
```

### 3. 切换模型

直接编辑 `.opencode/opencode.json` 文件：

```bash
python3 -c "
import json
p = '.opencode/opencode.json'
c = json.load(open(p))
c['model'] = 'provider-id/model-id'
json.dump(c, open(p, 'w'), indent=2, ensure_ascii=False)
print('已切换')
"
```

然后通知 opencode server 重新加载：

```bash
curl -s -X PATCH -H "Authorization: $AUTH" \
  -H "Content-Type: application/json" \
  -d '{"model":"provider-id/model-id"}' \
  http://localhost:19876/config
```

格式：`provider-id/model-id`，例如：
- `kimi-for-coding/k2p6` — Kimi K2.6
- `kimi-for-coding/kimi-k2-thinking` — Kimi K2 Thinking
- `alibaba-cn/qwen3.7-max` — Qwen3.7 Max
- `zhipuai-coding-plan/glm-5.1` — GLM 5.1
- `google/gemini-2.5-pro` — Gemini 2.5 Pro

---

## 回复策略

1. **用户问"有哪些模型"** → 执行命令 2，列出已连接 provider 及其模型，告知当前使用的模型
2. **用户说"换成 xxx"** → 匹配 provider/model，执行命令 3 切换，确认成功
3. **切换成功** → 告诉用户"已切换到 xxx，下一条消息生效"
4. **切换失败** → 告诉用户失败原因，列出可用模型供选择

---

## 注意事项

- 切换的是**全局默认模型**，所有新会话都会使用新模型
- 已存在的会话不受影响，只有新消息使用新模型
- 飞书用户也可以发 `/models` 命令，会弹出卡片直接点选切换（无需点点操作）
- `$OPENCODE_SERVER_PASSWORD` 在 `.env` 中，bash 工具可直接使用

---

*2026-05-27 创建*
