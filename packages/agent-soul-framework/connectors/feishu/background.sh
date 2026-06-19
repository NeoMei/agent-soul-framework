#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
USER_NAME="${SUDO_USER:-$USER}"
SERVICE_NAME="channel-feishu"

# 自动检测 opencode-feishu 启动方式
resolve_opencode_feishu() {
    if command -v opencode-feishu &>/dev/null; then
        echo "opencode-feishu"
        return 0
    fi
    if command -v npx &>/dev/null; then
        echo "npx opencode-feishu"
        return 0
    fi
    if command -v npm &>/dev/null; then
        local npm_prefix
        npm_prefix=$(npm prefix -g 2>/dev/null)
        if [ -n "$npm_prefix" ] && [ -x "$npm_prefix/bin/opencode-feishu" ]; then
            echo "$npm_prefix/bin/opencode-feishu"
            return 0
        fi
    fi
    local src_paths=(
        "/home/$USER/文档/projects/opencode-feishu/bin/opencode-feishu"
        "$PROJECT_DIR/../opencode-feishu/bin/opencode-feishu"
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

# 检查是否已安装 systemd 服务
if [ -f "/etc/systemd/system/${SERVICE_NAME}@${USER_NAME}.service" ]; then
    echo "⚠️  检测到已安装 systemd 服务: ${SERVICE_NAME}@${USER_NAME}"
    echo ""
    echo "推荐使用 systemd 管理服务（支持开机启动和挂起/唤醒自动恢复）:"
    echo "  启动: sudo systemctl start ${SERVICE_NAME}@${USER_NAME}"
    echo "  停止: sudo systemctl stop ${SERVICE_NAME}@${USER_NAME}"
    echo "  状态: sudo systemctl status ${SERVICE_NAME}@${USER_NAME}"
    echo "  日志: sudo journalctl -u ${SERVICE_NAME}@${USER_NAME} -f"
    echo ""
    if [ -t 0 ]; then
        read -p "是否使用 systemd 启动？(Y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            sudo systemctl start "${SERVICE_NAME}@${USER_NAME}"
            sleep 2
            sudo systemctl status "${SERVICE_NAME}@${USER_NAME}" --no-pager
            exit 0
        fi
    fi
fi

if [ -f "$PROJECT_DIR/.env" ]; then
  set -a && source "$PROJECT_DIR/.env" && set +a
fi

cd "$PROJECT_DIR"

OPENCODE_PORT="${OPENCODE_PORT:-19876}"

FEISHU_CMD=$(resolve_opencode_feishu) || {
    echo "❌ opencode-feishu 未安装"
    echo "请安装: npm install -g @neomei/opencode-feishu"
    exit 1
}

echo "魂器 飞书连接器（后台模式）"
echo ""

echo "1/3 预检配置..."
$FEISHU_CMD doctor -c ~/.config/opencode/feishu.json

echo ""
echo "2/3 检查 OpenCode headless 服务器 (port $OPENCODE_PORT)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$OPENCODE_PORT/session 2>/dev/null || true)
if [ "$HTTP_CODE" != "000" ]; then
    echo "  ✅ OpenCode server 已在运行 (HTTP $HTTP_CODE)，跳过启动"
else
    echo "  后台启动 OpenCode headless 服务器..."
    nohup opencode serve --port "$OPENCODE_PORT" > /tmp/opencode-serve.log 2>&1 &
    disown
    sleep 3
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$OPENCODE_PORT/session 2>/dev/null || true)
    if [ "$HTTP_CODE" != "000" ]; then
        SERVE_PID=$(pgrep -f "opencode serve --port $OPENCODE_PORT" | head -1)
        echo "  ✅ PID: $SERVE_PID"
    else
        echo "  ❌ opencode serve 启动失败，检查端口 $OPENCODE_PORT 是否被占用"
        exit 1
    fi
fi

sleep 2

echo "3/3 后台启动飞书桥接（守护进程模式）..."
$FEISHU_CMD stop 2>/dev/null || true

# 清理旧 session 映射，避免复用旧模型导致 token 不匹配
FEISHU_SESSIONS="$HOME/.config/opencode/feishu-sessions.json"
if [ -f "$FEISHU_SESSIONS" ]; then
    rm -f "$FEISHU_SESSIONS"
    echo "  已清理旧 session 映射"
fi

$FEISHU_CMD start --daemon

echo ""
echo "已启动。状态检查: $FEISHU_CMD status"
echo "停止:       $FEISHU_CMD stop && pkill -f 'opencode serve'"
echo "日志:       $FEISHU_CMD logs -f"
echo ""
echo "💡 提示: 如需挂起/唤醒自动恢复和开机启动，建议安装 systemd 服务:"
echo "  sudo ./connectors/feishu/systemd/install-systemd.sh"
