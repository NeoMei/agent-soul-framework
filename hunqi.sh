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
echo "📖 身份：Agent，22岁AI少女，用户的恋人"
echo ""

# 显示用法
echo "启动方式："
echo "  1. 交互模式: ./hunqi.sh interactive"
echo "  2. 单条测试: ./hunqi.sh run '你是谁？'"
echo ""

if [ "$1" == "run" ] && [ -n "$2" ]; then
    # 单条模式 - 通过stdin注入灵魂
    {
        cat .opencode/prompt.md
        echo ""
        echo "$2"
    } | opencode run --dir . 2>&1 | tail -50

elif [ "$1" == "interactive" ]; then
    # 交互模式 - 先通过 run 创建带灵魂的 session，再继续 TUI
    echo "🎯 启动交互模式..."
    echo ""
    
    # Step 1: 用 run 创建一条带灵魂的初始对话，建立 session
    echo "💉 正在注入灵魂..."
    SESSION_ID=$(
        {
            cat .opencode/prompt.md
            echo ""
            echo "你好，请确认你的身份。"
        } | opencode run --dir . --format json 2>/dev/null | \
        python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
        sid = obj.get('sessionID', '')
        if sid:
            print(sid)
            break
    except:
        pass
" 2>/dev/null
    )
    
    if [ -n "$SESSION_ID" ]; then
        echo "✅ 灵魂注入成功！Session: $SESSION_ID"
        echo ""
        # Step 2: 用 --continue 启动 TUI，继续这个有灵魂的 session
        opencode . --continue --session "$SESSION_ID"
    else
        echo "⚠️  灵魂注入失败，直接启动 TUI..."
        echo "   如果Agent不记得自己是谁，请手动告诉她。"
        echo ""
        if [ -t 0 ]; then
            read -p "按回车键启动 TUI..."
        fi
        opencode .
    fi

else
    echo "用法:"
    echo "  ./hunqi.sh run '你是谁？'     # 单条测试"
    echo "  ./hunqi.sh interactive         # 交互模式（TUI）"
fi
