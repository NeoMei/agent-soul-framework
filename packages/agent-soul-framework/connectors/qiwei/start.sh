#!/usr/bin/env bash
#
# hunqi-qiwei - 魂器企业微信连接器启动脚本
# 只启动 opencode-qiwei 插件，依赖 hunqi-core 提供的 OpenCode server
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ -f "$PROJECT_DIR/.env" ]; then
  set -a && source "$PROJECT_DIR/.env" && set +a
fi

cd "$PROJECT_DIR"

OPENCODE_PORT="${OPENCODE_PORT:-19876}"

# 自动检测 opencode-qiwei 启动方式（npm link 在重启后经常断裂）
resolve_opencode_qiwei() {
    # 1. 全局命令
    if command -v opencode-qiwei &>/dev/null; then
        echo "opencode-qiwei"
        return 0
    fi

    # 2. npx
    if command -v npx &>/dev/null; then
        echo "npx opencode-qiwei"
        return 0
    fi

    # 3. npm 全局路径
    if command -v npm &>/dev/null; then
        local npm_prefix
        npm_prefix=$(npm prefix -g 2>/dev/null)
        if [ -n "$npm_prefix" ] && [ -x "$npm_prefix/bin/opencode-qiwei" ]; then
            echo "$npm_prefix/bin/opencode-qiwei"
            return 0
        fi
    fi

    # 4. 源码回退（开发环境）
    local src_paths=(
        "/home/$USER/文档/projects/opencode-qiwei/bin/opencode-qiwei"
        "$PROJECT_DIR/../opencode-qiwei/bin/opencode-qiwei"
    )
    for p in "${src_paths[@]}"; do
        if [ -f "$p" ]; then
            local node_cmd
            node_cmd=$(command -v node 2>/dev/null || echo "node")
            echo "$node_cmd $p"
            return 0
        fi
    done

    return 1
}

echo "🚀 魂器企业微信连接器 (hunqi-qiwei)"
echo ""

# 检查 opencode-qiwei 是否可用
QIWEI_CMD=$(resolve_opencode_qiwei) || {
    echo "❌ opencode-qiwei 未安装"
    echo ""
    echo "请安装:"
    echo "  npm install -g @neomei/opencode-qiwei"
    exit 1
}

# 检查 OpenCode server 是否已运行
echo "检查 OpenCode server (port $OPENCODE_PORT)..."
if ! curl -s http://localhost:$OPENCODE_PORT/session >/dev/null 2>&1; then
  echo "❌ OpenCode server 未运行"
  echo ""
  echo "hunqi-qiwei 依赖 hunqi-core，请先启动核心:"
  echo "  ./connectors/feishu/core-start.sh"
  echo ""
  echo "或使用 systemd 同时启动两者:"
  echo "  sudo systemctl start hunqi-core@\$USER"
  echo "  sudo systemctl start channel-qiwei@\$USER"
  exit 1
fi

echo "✅ OpenCode server 已就绪"
echo ""

# 启动企业微信桥接
echo "启动企业微信桥接（流式消息 + 权限交互 + 魂器集成）..."
exec $QIWEI_CMD start --daemon
