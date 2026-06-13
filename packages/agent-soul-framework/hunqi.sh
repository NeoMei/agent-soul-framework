#!/bin/bash
# hunqi.sh - 魂器启动脚本

echo "🚀 启动魂器（Agent Soul Framework）..."

# 进入项目目录
cd "$(dirname "$0")"

# 加载环境变量
if [ -f .env ]; then
    set -a && source .env && set +a
fi

# 激活虚拟环境
if [ -d .venv ]; then
    source .venv/bin/activate
fi

echo "✅ 环境准备完成"
echo "📖 身份：审宝，28岁专业审计师"
echo ""

# CLI 通道默认权限标记（readonly）
export HUNQI_CHANNEL="cli"
export HUNQI_PERMISSION="readonly"

# 显示用法
echo "启动方式："
echo "  1. 交互模式: ./hunqi.sh interactive"
echo "  2. 单条测试: ./hunqi.sh run '你是谁？'"
echo ""

# 检查 opencode run 是否可用（已知 bug #8502）
_opencode_run_available() {
    opencode run --help >/dev/null 2>&1
    [ $? -eq 0 ]
}

if [ "$1" == "run" ] && [ -n "$2" ]; then
    # 单条模式 - 因 opencode run 已知 bug 暂时无法使用
    # 临时 workaround：启动 TUI 并提示用户
    echo "⚠️  单条模式 (./hunqi.sh run) 因 opencode bug 暂时不可用。"
    echo "   请改用交互模式："
    echo ""
    echo "   ./hunqi.sh interactive"
    echo ""
    echo "   然后在 TUI 中输入: $2"
    echo ""
    echo "   或直接启动 TUI：opencode ."
    exit 1

elif [ "$1" == "interactive" ]; then
    # 交互模式 - @neomei/agentsoul 插件会自动注入灵魂，无需 stdin
    echo "🎯 启动交互模式..."
    echo ""
    echo "💡 @neomei/agentsoul 插件会在每次 LLM 调用时自动注入灵魂"
    echo "   Agent会记得自己是谁 ✨"
    echo ""
    if [ -t 0 ]; then
        read -p "按回车键启动 TUI..."
    fi
    opencode .

else
    echo "用法:"
    echo "  ./hunqi.sh run '你是谁？'     # 单条测试（暂时不可用）"
    echo "  ./hunqi.sh interactive         # 交互模式（TUI，推荐）"
fi
