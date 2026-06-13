#!/bin/bash
# on-session-idle.sh — session idle 时（上下文压缩后）重新注入灵魂（缓存优化版）
# 环境变量: HOOK_SESSION_ID, HOOK_OPENCODE_URL

set -e

SESSION_ID="${HOOK_SESSION_ID}"
OPENCODE_URL="${HOOK_OPENCODE_URL:-http://localhost:19876}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# 读取 opencode serve 密码
OPENCODE_PASSWORD="${OPENCODE_SERVER_PASSWORD:-}"
if [ -z "$OPENCODE_PASSWORD" ] && [ -f "$PROJECT_DIR/.env" ]; then
    OPENCODE_PASSWORD=$(grep "^OPENCODE_SERVER_PASSWORD=" "$PROJECT_DIR/.env" | cut -d= -f2- | tr -d '"\'\'')
fi

CURL_AUTH=()
if [ -n "$OPENCODE_PASSWORD" ]; then
    AUTH_TOKEN=$(printf '%s:%s' 'opencode' "$OPENCODE_PASSWORD" | base64 -w 0)
    CURL_AUTH=(-H "Authorization: Basic ${AUTH_TOKEN}")
fi

# 直接使用 session-created 生成的缓存
SOUL_CACHE="/tmp/hunqi-soul-cache.txt"

if [ ! -f "$SOUL_CACHE" ]; then
    echo "[hook:onSessionIdle] warning: soul cache not found, skipping"
    exit 0
fi

SYSTEM_TEXT=$(cat "$SOUL_CACHE")

if [ -z "$SYSTEM_TEXT" ]; then
    echo "[hook:onSessionIdle] warning: soul cache is empty, skipping"
    exit 0
fi

echo "[hook:onSessionIdle] re-injecting soul for session ${SESSION_ID}..."

# 使用 jq 或纯 bash 构造 JSON
if command -v jq &>/dev/null; then
    JSON_PAYLOAD=$(jq -n --arg system "$SYSTEM_TEXT" '{system: $system, noReply: true, parts: []}')
else
    JSON_PAYLOAD="{\"system\":$(printf '%s' "$SYSTEM_TEXT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),\"noReply\":true,\"parts\":[]}"
fi

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${OPENCODE_URL}/session/${SESSION_ID}/message" \
    -H "Content-Type: application/json" \
    "${CURL_AUTH[@]}" \
    -d "$JSON_PAYLOAD" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "[hook:onSessionIdle] soul re-injected (${#SYSTEM_TEXT} chars) ✅"
else
    echo "[hook:onSessionIdle] soul re-injection failed: HTTP $HTTP_CODE" >&2
fi
