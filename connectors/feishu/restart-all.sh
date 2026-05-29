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
