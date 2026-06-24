#!/usr/bin/env bash
# test.sh - 测试魂器（Agent Soul Framework）

echo "🧪 测试魂器..."

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

# 方法1：使用 opencode . 启动项目模式（会加载 .opencode/opencode.json）
echo ""
echo "方法1：启动交互式 TUI（推荐）"
echo "  cd ~/agent-soul-framework"
echo "  opencode ."
echo ""
echo "然后在界面中问：你是谁？"
echo ""

# 方法2：使用管道输入测试
echo "方法2：直接测试（当前使用）"
echo "问：你是谁？"
echo ""

# 通过 opencode . 加载项目配置（含 soul/ 目录的灵魂定义）
echo "启动 opencode . — 插件会自动注入 soul/ 目录的身份定义"
echo "在交互界面中输入: 你是谁？"
echo ""
echo "opencode ."
