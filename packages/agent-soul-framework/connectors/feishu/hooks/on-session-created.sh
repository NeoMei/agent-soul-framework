#!/usr/bin/env bash
# on-session-created.sh — 新建 session 时注入灵魂文件（缓存优化版）
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

# 缓存文件路径
SOUL_CACHE="/tmp/hunqi-soul-cache.txt"
SOUL_FILES=(
    "$PROJECT_DIR/soul/IDENTITY.md"
    "$PROJECT_DIR/soul/SOUL.md"
    "$PROJECT_DIR/soul/USER.md"
    "$PROJECT_DIR/soul/AGENTS.md"
)

# 检查是否需要更新缓存（任一灵魂文件比缓存新）
needs_update=false
if [ ! -f "$SOUL_CACHE" ]; then
    needs_update=true
else
    cache_mtime=$(stat -c %Y "$SOUL_CACHE" 2>/dev/null || stat -f %m "$SOUL_CACHE")
    for f in "${SOUL_FILES[@]}"; do
        if [ -f "$f" ]; then
            file_mtime=$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f")
            if [ "$file_mtime" -gt "$cache_mtime" ]; then
                needs_update=true
                break
            fi
        fi
    done
fi

# 更新缓存
if [ "$needs_update" = true ]; then
    SEPARATOR=$'\n\n---\n\n'
    SYSTEM_TEXT=""
    for f in "${SOUL_FILES[@]}"; do
        if [ -f "$f" ]; then
            BASENAME=$(basename "$f")
            CONTENT=$(cat "$f")
            SYSTEM_TEXT="${SYSTEM_TEXT}${SEPARATOR}=== ${BASENAME} ===${SEPARATOR}${CONTENT}"
        fi
    done
    # 去掉开头的分隔符
    SYSTEM_TEXT="${SYSTEM_TEXT#${SEPARATOR}}"
    echo "$SYSTEM_TEXT" > "$SOUL_CACHE"
    echo "[hook] soul cache updated (${#SYSTEM_TEXT} chars)"
fi

# 从缓存读取
SYSTEM_TEXT=$(cat "$SOUL_CACHE")

# 追加近期对话记忆（不缓存，每次实时查询）
MEMORY_SCRIPT="$SCRIPT_DIR/query-memory.mjs"
if [ -f "$MEMORY_SCRIPT" ]; then
  RECENT_MEMORY=$(node "$MEMORY_SCRIPT" "$PROJECT_DIR" 2>/dev/null || echo "")
  if [ -n "$RECENT_MEMORY" ]; then
    SYSTEM_TEXT="${SYSTEM_TEXT}

---

## 近期对话记忆

${RECENT_MEMORY}"
  fi
fi

if [ -z "$SYSTEM_TEXT" ]; then
    echo "[hook:onSessionCreated] warning: soul cache is empty"
    exit 0
fi

echo "[hook:onSessionCreated] injecting soul + memory for session ${SESSION_ID}..."

# 使用 jq 或纯 bash 构造 JSON，避免 python3 进程开销
if command -v jq &>/dev/null; then
    JSON_PAYLOAD=$(jq -n --arg system "$SYSTEM_TEXT" '{system: $system, noReply: true, parts: []}')
else
    # 纯 bash fallback（简单转义）
    JSON_PAYLOAD="{\"system\":$(printf '%s' "$SYSTEM_TEXT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),\"noReply\":true,\"parts\":[]}"
fi

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${OPENCODE_URL}/session/${SESSION_ID}/message" \
    -H "Content-Type: application/json" \
    "${CURL_AUTH[@]}" \
    -d "$JSON_PAYLOAD" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "[hook:onSessionCreated] soul injected (${#SYSTEM_TEXT} chars) ✅"
else
    echo "[hook:onSessionCreated] soul injection failed: HTTP $HTTP_CODE" >&2
    exit 1
fi
