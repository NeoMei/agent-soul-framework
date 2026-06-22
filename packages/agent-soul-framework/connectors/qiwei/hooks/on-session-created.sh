#!/usr/bin/env bash
# on-session-created.sh — session 创建事件 hook
# 灵魂注入已统一由 hunqi-plugin（OpenCode 插件）处理，此脚本保留用于未来扩展
# 环境变量: HOOK_SESSION_ID, HOOK_OPENCODE_URL

echo "[hook:onSessionCreated] session=${HOOK_SESSION_ID} — 灵魂注入由 hunqi-plugin 统一处理 ✅"
