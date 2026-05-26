# opencode-feishu 竞态 Bug：权限卡确认流程卡死

## 现象

用户点击权限卡片上的「确认」按钮后：
1. 卡片更新报错 `200340`（MessageNotPersisted）
2. 飞书客户端显示错误提示
3. AI session 被卡住，无法继续对话
4. 发送新消息提示「正在处理上一条消息」，流程彻底卡死

## 复现步骤

1. 在飞书私聊中让 AI 执行需要权限的操作（如读取 `~/.config/opencode/` 目录）
2. AI 触发 `permission.asked` 事件，权限卡片显示「确认/始终/拒绝」按钮
3. **等待 10-15 秒不点击**（让 AI 继续输出文本）
4. 点击「确认」
5. 观察错误

## 根因分析

### 时序图

```
时间线
─────────────────────────────────────────────────────►

服务端:  permission.asked ─┬─ Text delta ─ Text delta ─ Text delta ─ ...
                           │
                           ├─ flushCard ──► PATCH card #1  (带权限按钮)
                           │
                           ├─ flushCard ──► PATCH card #2  (文本+权限)
                           │
                           ├─ flushCard ──► PATCH card #3
                           │        ...
                           ├─ flushCard ──► PATCH card #N  ← 200340: 卡片已达 PATCH 上限！
                           │
                           │                        [用户点击确认]
                           │                              │
                           ├─ handlePermissionCardAction ─┤
                           │   ├─ replyPermission() ──────┼── 可能成功
                           │   └─ updateCard() ───────────┼── 200340: 卡片不可修改！
                           │                              │
                           └─ 用户看到错误/卡死           ◄
```

### 代码路径

1. **`event-handler.js:handlePermissionAsked()`** — 设置 `session.pendingInteraction`，调用 `flushCard()`
2. **`event-handler.js:flushCard()`** — 检查 `session.interactionReplied`（点击确认后置 true），但**不检查** `session.pendingInteraction`（权限挂起中）
3. 每次 `Text delta` 事件 → `flushCard()` → `updateCard()` → PATCH 同一张卡片
4. 飞书卡片 PATCH 次数有限（约 10-15 次内）
5. 用户点击确认时，卡片已超过 PATCH 上限 → **200340**

### 关键代码位置

**文件：`dist/opencode/event-handler.js`**

```javascript
// flushCard() 中的跳过逻辑（第 ~421 行）
if (session.interactionReplied) {
    // ✅ 点击确认后跳过（防止覆盖确认状态）
    return;
}
// ❌ 缺少：权限挂起中也应该跳过或限流
// if (session.pendingInteraction?.kind === 'permission') {
//     // 权限挂起中，不要频繁 PATCH 卡片
// }

// 节流逻辑（第 ~450 行）
if (!opts.force && now - lastUpdate <= UPDATE_THROTTLE_MS) {
    return;  // 2秒节流，但 AI 输出超过 20 秒仍然累计 10+ 次
}
```

**文件：`dist/feishu/api.js`**

```javascript
// updateCard() 错误处理（第 ~55 行）
if (res.code !== 0) {
    if (res.code === 230020) {
        log.warn(...); return;  // ✅ 频率限制，吞掉
    }
    // ❌ 缺少 200340 处理（已在本次修复中添加）
    throw new Error(...);
}
```

**文件：`dist/core/message-handler.js`**

```javascript
// handlePermissionCardAction()（第 ~490 行）
void (async () => {
    await this.opencode.replyPermission(perm.id, reply);  // ① 可能是唯一成功的步骤
    await this.feishuApi.updateCard(messageId, confirmCard);  // ② 可能因 200340 失败
})();
return { toast: { type: 'success', content: confirmText } };  // ③ 无论成功失败都返回 success
// 如果 ① 成功但 ② 失败，AI 继续运行，但卡片不更新 → 用户体验差
// 如果 ① 也失败（超时/网络），AI 永远卡在等待权限状态
```

## 修复方案

### 方案 A：权限挂起时冻结卡片更新（推荐，最小改动）

在 `flushCard()` 中，当 `session.pendingInteraction` 存在且类型为 `permission` 时，完全跳过卡片更新：

```javascript
// 在 if (session.interactionReplied) 之后添加
if (session.pendingInteraction?.kind === 'permission' && !opts.done) {
    log.info({ chatId }, 'flushCard skipped: permission interaction pending');
    return;
}
```

**优点**：卡片不被打补丁，用户有充足时间点击确认  
**缺点**：用户看不到 AI 继续输出的文本（直到点击确认后）

### 方案 B：权限卡片与文本卡片分离

权限请求时创建一张**新的独立卡片**（`sendCard`），而不是嵌入到流式卡片中：

```javascript
// handlePermissionAsked() 中
await this.feishuApi.sendCard(chatId, permissionOnlyCard);
// 不清除 currentMessageId，文本继续更新原卡片
```

**优点**：文本流不受影响，权限按钮独立存在  
**缺点**：用户看到两张卡片，可能困惑

### 方案 C：静默权限 + 文本提醒

不发送权限卡片，而是在文本中提醒用户需要授权，引导用户手动输入 `/confirm` 等命令：

**优点**：完全避免卡片竞态  
**缺点**：用户体验不如卡片按钮直观

### 方案 D：混合方案

1. 权限挂起时，将 `UPDATE_THROTTLE_MS` 从 2 秒提高到 10 秒（减少 PATCH 次数）
2. 如果 `updateCard` 返回 `200340`，改用 `sendCard` 创建新卡
3. `replyPermission` 在卡片操作之前执行（确保 AI 不被卡住）

## 临时 workaround（用户侧）

1. 在飞书中发送新消息「继续」→ 但需先重启 opencode serve 清除卡死状态
2. 授权请求弹出后，**立即点击确认**（不要等待 AI 继续输出）

## 修复验证

修复后预期行为：
1. 用户点击确认 → 卡片立即翻为「✅ 已授权」状态
2. AI 继续输出 → 更新的是同一张卡（或新卡）
3. 无论点击快慢，流程不卡死
4. 日志中不再出现 `200340` 错误

## 已打补丁（本魂器项目）

当前在 `dist/feishu/api.js` 中已添加 200340 静默处理：

```javascript
if (res.code === 230020 || res.code === 200340) {
    log.warn({ resCode: res.code, ... }, 'updateCard hit limit, skipping');
    return;
}
```

这是**止血措施**，不能根治竞态。根治需要按上述方案修改 opencode-feishu 源码。
