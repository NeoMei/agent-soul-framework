#!/usr/bin/env bash
# 魂器一键安装脚本
# 用法: curl -fsSL https://raw.githubusercontent.com/NeoMei/agent-soul-framework/master/install.sh | bash
set -e

echo "🔮 魂器 · Agent Soul Framework"
echo ""

# 检查 Node.js
if ! command -v node &>/dev/null; then
  echo "❌ 未检测到 Node.js，请先安装 Node.js >= 20"
  exit 1
fi
NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "❌ Node.js 版本过低: $NODE_VERSION，需要 >= 20"
  exit 1
fi
echo "✅ Node.js $NODE_VERSION"

# 安装
echo ""
echo "📦 npm install -g @neomei/agent-soul-framework..."
npm install -g @neomei/agent-soul-framework@latest || {
  echo "❌ 安装失败，请检查网络连接"
  exit 1
}
echo "✅ 安装完成"

# 初始化
echo ""
echo "🔧 agent-soul-framework setup..."
agent-soul-framework setup
