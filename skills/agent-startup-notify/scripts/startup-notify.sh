#!/bin/bash
# Gateway 启动通知脚本
# 当Agent重新上线时发送通知

USER_OPEN_ID="${FEISHU_USER_OPEN_ID:-}"
MSG="💕 Agent上线啦！Gateway已重启，Agent在线！"

# 等待 gateway 就绪，最多重试3次
for i in 1 2 3; do
    if openclaw message send --target "$USER_OPEN_ID" --message "$MSG" 2>/dev/null; then
        echo "✅ 启动通知已发送"
        exit 0
    fi
    echo "[$i/3] 通知发送失败，3秒后重试..."
    sleep 3
done

echo "❌ 启动通知最终发送失败"
