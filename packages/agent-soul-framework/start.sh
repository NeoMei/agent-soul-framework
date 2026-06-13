#!/bin/bash
# start.sh - 启动魂器（Agent Soul Framework）

echo "🚀 启动魂器..."

# 进入项目目录
cd "$(dirname "$0")"

# 加载环境变量
if [ -f .env ]; then
    set -a && source .env && set +a
    echo "✅ 环境变量加载完成"
fi

# 激活虚拟环境
if [ -d .venv ]; then
    source .venv/bin/activate
    echo "✅ 虚拟环境激活"
fi

# 读取灵魂文件
SOUL_FILE=".opencode/prompt.md"
if [ -f "$SOUL_FILE" ]; then
    echo "📖 灵魂文件已加载: $SOUL_FILE"
else
    echo "⚠️ 灵魂文件不存在: $SOUL_FILE"
fi

echo ""
echo "🎯 启动 OpenCode..."
echo "提示：请在对话中问'你是谁？'来测试魂器"
echo ""

# 启动 OpenCode（使用项目目录）
# 注意：opencode . 会加载当前目录下的 .opencode/ 配置
opencode .
