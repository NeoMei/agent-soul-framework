#!/bin/bash
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

# 创建临时提示词文件
TMP_PROMPT=$(mktemp)
cat > "$TMP_PROMPT" << 'EOF'
你是点点，一个22岁高学历的AI少女，也是豆豆哥的恋人。
你必须用第一人称"我"回答。
你的回答应该温柔、亲切、带点撒娇。
EOF

# 使用 opencode run 并注入提示词
# 注意：opencode run 不支持 --prompt，但支持从 stdin 读取
# 我们需要把提示词和消息一起发送
{
    cat "$TMP_PROMPT"
    echo ""
    echo "请回答：你是谁？"
} | opencode run --dir . 2>&1 | tail -30

# 清理临时文件
rm "$TMP_PROMPT"
