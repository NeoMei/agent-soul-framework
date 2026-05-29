#!/bin/bash
#
# restart-all.sh — 重启全部服务（opencode serve + opencode-feishu）
# 顺序：先重启 serve（保留连接），再重启 feishu（先起后杀）
#
set -e

PORT=${1:-19876}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🔄 重启全部服务..."
echo ""

# ── 1. 重启 opencode serve ──
echo "1/2 重启 OpenCode serve..."
"$PROJECT_DIR/connectors/feishu/restart-serve.sh" "$PORT"
sleep 2

# ── 2. 重启 opencode-feishu（使用先起后杀策略）──
echo ""
echo "2/2 重启飞书连接器..."
"$PROJECT_DIR/connectors/feishu/restart-feishu.sh"

echo ""
echo "✅ 全部服务重启完成"
echo "   检查状态: opencode-feishu status"

# ── 3. 发送完成通知到飞书 ──
if [ -n "$FEISHU_NOTIFY_CHAT_ID" ]; then
    FEISHU_CONFIG="$HOME/.config/opencode/feishu.json"
    if [ -f "$FEISHU_CONFIG" ]; then
        APP_ID=$(node -e "console.log(require('$FEISHU_CONFIG').appId || '')" 2>/dev/null)
        APP_SECRET=$(node -e "console.log(require('$FEISHU_CONFIG').appSecret || '')" 2>/dev/null)
        
        if [ -n "$APP_ID" ] && [ -n "$APP_SECRET" ]; then
            # 获取 tenant_access_token
            TOKEN_RESPONSE=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
                -H "Content-Type: application/json" \
                -d "{\"app_id\":\"$APP_ID\",\"app_secret\":\"$APP_SECRET\"}" 2>/dev/null)
            
            TOKEN=$(echo "$TOKEN_RESPONSE" | node -e "
                let d = '';
                process.stdin.on('data', c => d += c);
                process.stdin.on('end', () => {
                    try {
                        const data = JSON.parse(d);
                        console.log(data.tenant_access_token || '');
                    } catch {
                        console.log('');
                    }
                });
            " 2>/dev/null)
            
            if [ -n "$TOKEN" ]; then
                curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id" \
                    -H "Authorization: Bearer $TOKEN" \
                    -H "Content-Type: application/json" \
                    -d "{\"receive_id\":\"$FEISHU_NOTIFY_CHAT_ID\",\"msg_type\":\"text\",\"content\":\"{\\\"text\\\":\\\"✅ 全部服务重启完成，点点已经准备好继续陪你聊天啦～\\\"}\"}" > /dev/null 2>&1 || true
            fi
        fi
    fi
fi
