#!/bin/bash
#
# 魂器 systemd 服务安装程序
# 核心+频道架构：hunqi-core + channel-feishu
#
set -e

# 错误处理：打印行号和命令
trap 'print_error "脚本在第 ${LINENO} 行出错: $BASH_COMMAND"; exit 1' ERR

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
USER_NAME="${SUDO_USER:-$USER}"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[魂器]${NC} $1"; }
print_success() { echo -e "${GREEN}[成功]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[警告]${NC} $1"; }
print_error() { echo -e "${RED}[错误]${NC} $1" >&2; }

if [ "$EUID" -ne 0 ]; then
    print_error "需要 root 权限"
    print_status "请使用: sudo $0"
    exit 1
fi

# 辅助函数：安全读取用户输入（支持交互式和非交互式环境）
safe_read() {
    local prompt="$1"
    local var_name="$2"
    if [ -t 0 ] || [ -e /dev/tty ]; then
        read -rp "$prompt" "$var_name" < /dev/tty
    else
        # 非交互式环境：使用默认值或退出
        print_warning "非交互式环境，无法读取输入"
        return 1
    fi
}

if [ -z "$SUDO_USER" ] && [ "$USER" = "root" ]; then
    safe_read "请输入运行魂器的用户名: " USER_NAME || { print_error "非交互式环境请设置 SUDO_USER 环境变量"; exit 1; }
    [ -z "$USER_NAME" ] && { print_error "用户名不能为空"; exit 1; }
fi

# 获取用户真正的家目录（不假设 /home/ 前缀）
HOME_DIR=$(getent passwd "$USER_NAME" | cut -d: -f6)
if [ -z "$HOME_DIR" ]; then
    print_error "无法获取用户 $USER_NAME 的家目录"
    exit 1
fi

# 自动检测项目目录（支持多种安装位置）
resolve_project_dir() {
    # 1. 从脚本位置推导（开发环境，直接 clone 源码）
    local script_project="$(cd "$SCRIPT_DIR/../.." && pwd)"
    if [ -f "$script_project/package.json" ]; then
        echo "$script_project"
        return 0
    fi

    # 2. ~/.hunqi/agent-soul-framework（install.sh 默认安装位置）
    if [ -f "$HOME_DIR/.hunqi/agent-soul-framework/package.json" ]; then
        echo "$HOME_DIR/.hunqi/agent-soul-framework"
        return 0
    fi

    # 3. 中文路径 ~/文档/projects/agent-soul-framework
    if [ -f "$HOME_DIR/文档/projects/agent-soul-framework/package.json" ]; then
        echo "$HOME_DIR/文档/projects/agent-soul-framework"
        return 0
    fi

    # 4. 英文路径 ~/Documents/projects/agent-soul-framework
    if [ -f "$HOME_DIR/Documents/projects/agent-soul-framework/package.json" ]; then
        echo "$HOME_DIR/Documents/projects/agent-soul-framework"
        return 0
    fi

    return 1
}

PROJECT_DIR=$(resolve_project_dir) || true

CORE_SERVICE="hunqi-core@${USER_NAME}"
FEISHU_SERVICE="channel-feishu@${USER_NAME}"

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║  魂器 systemd 服务安装程序 (核心+频道架构)        ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
print_status "用户: $USER_NAME"
print_status "核心: hunqi-core (点点本体)"
print_status "频道: channel-feishu (飞书接入)"
echo ""

# 1. 检查系统
print_status "1/5 检查系统..."
if ! command -v systemctl &> /dev/null; then
    print_error "systemctl 未找到"
    exit 1
fi
print_success "systemd 检查通过"

# 2. 检查目录
print_status "2/5 检查目录..."
[ ! -d "$HOME_DIR" ] && { print_error "用户目录不存在: $HOME_DIR"; exit 1; }

if [ -z "$PROJECT_DIR" ] || [ ! -d "$PROJECT_DIR" ]; then
    print_error "未找到魂器项目目录"
    print_status "已搜索的位置:"
    print_status "  - $(cd "$SCRIPT_DIR/../.." && pwd)"
    print_status "  - $HOME_DIR/.hunqi/agent-soul-framework"
    print_status "  - $HOME_DIR/文档/projects/agent-soul-framework"
    print_status "  - $HOME_DIR/Documents/projects/agent-soul-framework"
    echo ""

    if safe_read "请输入魂器项目目录的完整路径: " PROJECT_DIR; then
        [ -z "$PROJECT_DIR" ] && { print_error "目录不能为空"; exit 1; }
        if [ ! -f "$PROJECT_DIR/package.json" ]; then
            print_error "该目录不是有效的魂器项目（缺少 package.json）"
            exit 1
        fi
    else
        print_error "非交互式环境无法输入路径，请通过环境变量指定: PROJECT_DIR=/path/to/asf sudo -E $0"
        exit 1
    fi
fi

print_success "项目目录: $PROJECT_DIR"

# 3. 检查依赖
print_status "3/5 检查依赖..."

# 使用 wrapper 检测 opencode（支持 nvm 等非 PATH 安装）
# 注意：必须以目标用户的 HOME 运行 wrapper，否则 nvm 路径搜不到
if [ -x "$HOME_DIR/.hunqi/bin/opencode-feishu" ]; then
    if ! HOME="$HOME_DIR" "$HOME_DIR/.hunqi/bin/opencode-feishu" --resolve-opencode &> /dev/null; then
        print_warning "opencode 未找到（hunqi-core 需要它）"
        print_info "安装命令: npm install -g opencode-ai"
    else
        print_success "opencode 已安装"
    fi
    if ! HOME="$HOME_DIR" "$HOME_DIR/.hunqi/bin/opencode-feishu" --resolve-feishu &> /dev/null; then
        print_warning "opencode-feishu 未找到"
        print_info "安装命令: npm install -g @neomei/opencode-feishu"
    else
        print_success "opencode-feishu 已安装"
    fi
else
    # fallback: 直接检查 PATH
    if ! sudo -u "$USER_NAME" bash -c 'command -v opencode &> /dev/null'; then
        print_warning "opencode 未找到"
    fi
    if ! sudo -u "$USER_NAME" bash -c 'command -v opencode-feishu &> /dev/null'; then
        print_warning "opencode-feishu 未找到"
    fi
fi
print_success "依赖检查完成"

# 4. 安装服务文件
print_status "4/5 安装服务文件..."

# 检查源服务文件是否存在
if [ ! -f "$SCRIPT_DIR/hunqi-core@.service" ]; then
    print_error "服务文件缺失: $SCRIPT_DIR/hunqi-core@.service"
    exit 1
fi
if [ ! -f "$SCRIPT_DIR/channel-feishu@.service" ]; then
    print_error "服务文件缺失: $SCRIPT_DIR/channel-feishu@.service"
    exit 1
fi

# 清理旧命名
rm -f "/etc/systemd/system/hunqi-feishu@.service" 2>/dev/null || true

# 安装新服务（将 %h 替换为实际家目录，因为系统级 systemd 中 %h 展开为 /root）
sed "s|%h|$HOME_DIR|g" "$SCRIPT_DIR/hunqi-core@.service" > "/etc/systemd/system/hunqi-core@.service"
sed "s|%h|$HOME_DIR|g" "$SCRIPT_DIR/channel-feishu@.service" > "/etc/systemd/system/channel-feishu@.service"
chmod 644 "/etc/systemd/system/hunqi-core@.service"
chmod 644 "/etc/systemd/system/channel-feishu@.service"

# 验证替换后的路径是否正确
if grep -q "WorkingDirectory=$HOME_DIR/.hunqi/agent-soul-framework" "/etc/systemd/system/hunqi-core@.service" 2>/dev/null; then
    print_success "服务文件已安装"
else
    print_error "服务文件路径替换失败"
    exit 1
fi

# 5. 配置挂起/唤醒钩子
print_status "5/5 配置挂起/唤醒恢复..."

HOOK_DIR="$PROJECT_DIR/connectors/feishu/systemd/sleep-hooks"
mkdir -p "$HOOK_DIR"

cat > "$HOOK_DIR/99-hunqi-resume.sh" << 'EOF'
#!/bin/bash
# 魂器挂起/唤醒钩子 - 重启核心和所有频道

case "$1" in
    pre)
        logger "[hunqi] 系统即将挂起"
        ;;
    post)
        logger "[hunqi] 系统唤醒，重启服务..."
        systemctl restart 'hunqi-core@*'
        sleep 3
        systemctl restart 'channel-feishu@*'
        ;;
esac
EOF
chmod +x "$HOOK_DIR/99-hunqi-resume.sh"

if safe_read "安装系统级挂起/唤醒钩子？(y/N) " REPLY; then
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ -d "/lib/systemd/system-sleep" ]; then
            cp "$HOOK_DIR/99-hunqi-resume.sh" "/lib/systemd/system-sleep/"
            chmod +x "/lib/systemd/system-sleep/99-hunqi-resume.sh"
            print_success "系统级钩子已安装"
        else
            print_warning "/lib/systemd/system-sleep 不存在"
        fi
    else
        print_status "跳过系统级钩子"
    fi
else
    print_status "非交互式环境，跳过系统级钩子安装"
fi

if systemctl daemon-reload; then
    print_success "systemd 配置已重载"
else
    print_error "systemctl daemon-reload 失败（systemd 可能未运行）"
    exit 1
fi

if systemctl enable "$CORE_SERVICE" && systemctl enable "$FEISHU_SERVICE"; then
    print_success "服务已启用"
else
    print_error "服务启用失败"
    exit 1
fi

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║         安装完成！                                ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "核心服务:   hunqi-core@${USER_NAME}"
echo "飞书频道:   channel-feishu@${USER_NAME}"
echo ""
echo "管理命令:"
echo "  启动核心:   sudo systemctl start hunqi-core@${USER_NAME}"
echo "  启动飞书:   sudo systemctl start channel-feishu@${USER_NAME}"
echo "  停止飞书:   sudo systemctl stop channel-feishu@${USER_NAME}"
echo "  停止核心:   sudo systemctl stop hunqi-core@${USER_NAME}"
echo "  查看状态:   sudo systemctl status channel-feishu@${USER_NAME}"
echo "  查看日志:   sudo journalctl -u channel-feishu@${USER_NAME} -f"
echo ""
echo "架构说明:"
echo "  hunqi-core      = 点点本体 (OpenCode + 灵魂)"
echo "  channel-feishu  = 飞书频道 (接入核心)"
echo "  未来扩展:       channel-wechat, channel-discord..."
echo ""

if safe_read "立即启动服务？(y/N) " REPLY; then
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "停止现有进程..."
        # 只停止目标用户的进程，避免误杀其他用户
        sudo -u "$USER_NAME" pkill -f "opencode-feishu" 2>/dev/null || true
        sudo -u "$USER_NAME" pkill -f "opencode serve" 2>/dev/null || true
        sleep 2

        print_status "启动核心..."
        if systemctl start "$CORE_SERVICE"; then
            print_success "hunqi-core 已启动"
        else
            print_error "hunqi-core 启动失败，查看日志:"
            echo "  sudo journalctl -u $CORE_SERVICE --no-pager -n 20"
        fi
        sleep 5

        print_status "启动飞书频道..."
        if systemctl start "$FEISHU_SERVICE"; then
            print_success "channel-feishu 已启动"
        else
            print_error "channel-feishu 启动失败，查看日志:"
            echo "  sudo journalctl -u $FEISHU_SERVICE --no-pager -n 20"
        fi
        sleep 3

        if systemctl is-active --quiet "$FEISHU_SERVICE"; then
            print_success "服务运行正常！"
            systemctl status "$FEISHU_SERVICE" --no-pager
        else
            print_error "服务未正常运行，请查看日志排查"
        fi
    fi
else
    print_status "非交互式环境，跳过自动启动"
    echo ""
    echo "手动启动:"
    echo "  sudo systemctl start $CORE_SERVICE"
    echo "  sudo systemctl start $FEISHU_SERVICE"
fi
