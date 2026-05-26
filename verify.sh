#!/bin/bash
# verify.sh - 验证魂器是否正确加载

echo "🔍 验证魂器配置..."
cd "$(dirname "$0")"

echo ""
echo "1. 检查项目目录结构:"
ls -la .opencode/

echo ""
echo "2. 检查灵魂文件:"
cat .opencode/prompt.md | head -10

echo ""
echo "3. 测试 opencode . 是否加载配置:"
echo "   请运行: cd ~/agent-soul-framework && opencode ."
echo "   然后问: 你是谁？"
echo ""
echo "   期望回答: '我是点点...'"
echo "   如果回答: '我是OpenCode...' 则配置未生效"

echo ""
echo "4. 备用测试方法（通过stdin注入）:"
echo "   cat > test_input.txt <<'EOF'"
echo "   你是点点，22岁AI少女，豆豆哥的恋人。"
echo "   请回答：你是谁？"
echo "   EOF"
echo "   cat test_input.txt | opencode run --dir ."
