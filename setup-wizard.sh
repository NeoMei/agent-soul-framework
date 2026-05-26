#!/bin/bash
#
# 魂器配置向导 — 全新安装后的一站式配置程序
# 引导用户完成环境变量、连接器配置和服务启动
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
USER_NAME="${SUDO_USER:-$USER}"
HOME_DIR="$(getent passwd "$USER_NAME" | cut -d: -f6)"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}           魂器 · 初始配置向导                              ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  步骤 $1: $2${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_success() { echo -e "${GREEN}✅${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠️${NC}  $1"; }
print_error() { echo -e "${RED}❌${NC} $1"; }
print_info() { echo -e "${BLUE}ℹ️${NC}  $1"; }

# 非交互模式检测
NONINTERACTIVE="${NONINTERACTIVE:-0}"

# 安全读取输入
safe_read() {
    local prompt="$1"
    local var_name="$2"
    if [ "$NONINTERACTIVE" = "1" ]; then
        return 1
    fi
    if [ -t 0 ] || [ -e /dev/tty ]; then
        read -rp "$prompt" "$var_name" < /dev/tty
    else
        return 1
    fi
}

# 询问是否继续
ask_continue() {
    local msg="$1"
    if [ "$NONINTERACTIVE" = "1" ]; then
        return 0
    fi
    local answer
    safe_read "$msg [Y/n]: " answer
    [[ ! "$answer" =~ ^[Nn]$ ]]
}

# ───────────────────────────────────────────────
# 步骤 1: 环境检查
# ───────────────────────────────────────────────
step1_check_env() {
    print_step "1/5" "环境检查"

    local issues=0

    # 检查 Node.js
    if command -v node &>/dev/null; then
        NODE_VERSION=$(node -v | sed 's/v//')
        print_success "Node.js $NODE_VERSION"
    else
        print_error "Node.js 未安装（需要 ≥ 20）"
        issues=$((issues + 1))
    fi

    # 检查 opencode
    if command -v opencode &>/dev/null; then
        print_success "OpenCode 已安装"
    else
        print_warning "OpenCode 未找到，请运行: npm install -g opencode-ai"
        issues=$((issues + 1))
    fi

    # 检查 Python
    if command -v python3 &>/dev/null; then
        print_success "Python $(python3 --version 2>&1 | cut -d' ' -f2)"
    else
        print_warning "Python 未安装（心跳功能将不可用）"
    fi

    # 检查连接器
    if command -v opencode-feishu &>/dev/null; then
        print_success "飞书连接器 (opencode-feishu)"
    else
        print_warning "飞书连接器未找到"
    fi

    if command -v opencode-qiwei &>/dev/null; then
        print_success "企微连接器 (opencode-qiwei)"
    else
        print_info "企微连接器未安装（可选），安装命令: npm install -g @neomei/opencode-qiwei"
    fi

    if [ $issues -gt 0 ]; then
        print_warning "检测到 $issues 个问题，建议先修复再继续"
        if ! ask_continue "是否仍要继续配置"; then
            echo "配置已取消"
            exit 0
        fi
    else
        print_success "环境检查通过"
    fi
}

# ───────────────────────────────────────────────
# 步骤 2: .env 环境变量配置
# ───────────────────────────────────────────────
step2_env_config() {
    print_step "2/5" "环境变量配置"

    ENV_FILE="${HOME_DIR}/.hunqi/.env"
    mkdir -p "$(dirname "$ENV_FILE")"

    # 非交互模式: 如果已有 .env 就直接用，没有就创建一个空的
    if [ "$NONINTERACTIVE" = "1" ]; then
        if [ -f "$ENV_FILE" ] && [ -s "$ENV_FILE" ]; then
            print_success "使用现有 .env 配置"
        else
            echo "# 魂器环境变量配置" > "$ENV_FILE"
            echo "# 请手动填写 API Key 或使用 setup-wizard.sh 交互式配置" >> "$ENV_FILE"
            print_warning ".env 已创建（空），请在安装完成后手动配置 API Key"
        fi
        # 同步到项目目录
        if [ -f "$SCRIPT_DIR/.env" ]; then
            cp "$ENV_FILE" "$SCRIPT_DIR/.env"
        fi
        return 0
    fi

    # 如果已有 .env，询问是否覆盖
    if [ -f "$ENV_FILE" ] && [ -s "$ENV_FILE" ]; then
        if ! ask_continue "检测到已有的 .env 配置，是否重新配置"; then
            print_info "跳过 .env 配置，使用现有配置"
            return 0
        fi
    fi

    print_info "请填写以下 API Key（没有的可直接回车跳过）"
    echo ""

    local vars=()

    # DashScope API Key
    echo -e "${CYAN}阿里云百炼 (DashScope)${NC} — 用于文本嵌入和向量检索"
    echo "  获取地址: https://dashscope.aliyun.com/"
    local dashscope_key
    safe_read "  DASHSCOPE_API_KEY: " dashscope_key
    [ -n "$dashscope_key" ] && vars+=("DASHSCOPE_API_KEY=$dashscope_key")
    echo ""

    # 写入 .env
    {
        echo "# 魂器环境变量配置"
        echo "# 生成时间: $(date '+%Y-%m-%d %H:%M:%S')"
        echo ""
        for v in "${vars[@]}"; do
            echo "$v"
        done
    } > "$ENV_FILE"

    # 同时同步到项目目录
    if [ -f "$SCRIPT_DIR/.env" ]; then
        cp "$ENV_FILE" "$SCRIPT_DIR/.env"
    fi

    print_success ".env 已保存到 $ENV_FILE"
}

# ───────────────────────────────────────────────
# 步骤 3: 飞书配置
# ───────────────────────────────────────────────
step3_feishu() {
    print_step "3/5" "飞书连接器配置"

    if ! command -v opencode-feishu &>/dev/null; then
        print_warning "opencode-feishu 未安装，跳过飞书配置"
        print_info "安装命令: npm install -g @neomei/opencode-feishu"
        return 0
    fi

    local feishu_config="${HOME_DIR}/.config/opencode/feishu.json"

    # 非交互模式跳过（opencode-feishu setup 需要 tty 扫码）
    if [ "$NONINTERACTIVE" = "1" ]; then
        if [ -f "$feishu_config" ]; then
            print_success "飞书配置已存在"
        else
            print_info "非交互模式跳过飞书配置"
            print_info "请手动运行: opencode-feishu setup"
        fi
        return 0
    fi

    local setup_ran=0

    if [ -f "$feishu_config" ]; then
        print_success "飞书配置已存在"
        if ask_continue "是否重新配置飞书"; then
            echo ""
            opencode-feishu setup
            setup_ran=1
        else
            print_info "跳过飞书配置"
        fi
    else
        print_info "开始飞书配置向导..."
        echo "  将显示二维码，请用飞书 App 扫码"
        echo ""
        if ask_continue "是否现在配置飞书"; then
            opencode-feishu setup
            setup_ran=1
        else
            print_info "跳过飞书配置，稍后手动运行: opencode-feishu setup"
        fi
    fi

    # 扫码成功后，自动把凭证同步到 .env
    if [ "$setup_ran" = "1" ] && [ -f "$feishu_config" ]; then
        local fs_app_id fs_app_secret
        # 优先用 jq，否则用 sed 回退
        if command -v jq &>/dev/null; then
            fs_app_id=$(jq -r '.appId // empty' "$feishu_config" 2>/dev/null)
            fs_app_secret=$(jq -r '.appSecret // empty' "$feishu_config" 2>/dev/null)
        else
            fs_app_id=$(grep -o '"appId" *: *"[^"]*"' "$feishu_config" 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/')
            fs_app_secret=$(grep -o '"appSecret" *: *"[^"]*"' "$feishu_config" 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/')
        fi

        if [ -n "$fs_app_id" ] && [ -n "$fs_app_secret" ]; then
            ENV_FILE="${HOME_DIR}/.hunqi/.env"
            # 更新或追加 FEISHU_APP_ID / FEISHU_APP_SECRET
            for key_val in "FEISHU_APP_ID=$fs_app_id" "FEISHU_APP_SECRET=$fs_app_secret"; do
                key="${key_val%%=*}"
                if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
                    sed -i "s|^${key}=.*|${key_val}|" "$ENV_FILE"
                elif grep -q "^#.*${key}" "$ENV_FILE" 2>/dev/null; then
                    sed -i "s|^#.*${key}.*|${key_val}|" "$ENV_FILE"
                else
                    echo "$key_val" >> "$ENV_FILE"
                fi
            done
            # 同步到项目目录
            if [ -f "$SCRIPT_DIR/.env" ]; then
                cp "$ENV_FILE" "$SCRIPT_DIR/.env"
            fi
            print_success "飞书凭证已自动同步到 .env"
        fi
    fi

    # 如果仍然没有 feishu.json（用户跳过了扫码），提示手动输入
    if [ ! -f "$feishu_config" ]; then
        echo ""
        print_info "未检测到飞书配置，可手动补录凭证到 .env:"
        echo "  FEISHU_APP_ID=cli_xxxxxx"
        echo "  FEISHU_APP_SECRET=xxxxxxxx"
        echo "  配置文件: ${HOME_DIR}/.hunqi/.env"
    fi
}

# ───────────────────────────────────────────────
# 步骤 4: 企微配置
# ───────────────────────────────────────────────
step4_qiwei() {
    print_step "4/5" "企业微信连接器配置"

    if ! command -v opencode-qiwei &>/dev/null; then
        print_info "opencode-qiwei 未安装（可选），跳过企微配置"
        print_info "如需企微，安装命令: npm install -g @neomei/opencode-qiwei"
        return 0
    fi

    local qiwei_config="${HOME_DIR}/.config/opencode/qiwei.json"

    # 非交互模式跳过
    if [ "$NONINTERACTIVE" = "1" ]; then
        if [ -f "$qiwei_config" ]; then
            print_success "企微配置已存在"
        else
            print_info "非交互模式跳过企微配置"
            print_info "请手动运行: opencode-qiwei setup"
        fi
        return 0
    fi

    if [ -f "$qiwei_config" ]; then
        print_success "企微配置已存在"
        if ask_continue "是否重新配置企微"; then
            echo ""
            opencode-qiwei setup
        else
            print_info "跳过企微配置"
        fi
    else
        if ask_continue "是否现在配置企微"; then
            opencode-qiwei setup
        else
            print_info "跳过企微配置，稍后手动运行: opencode-qiwei setup"
        fi
    fi
}

# ───────────────────────────────────────────────
# 步骤 5: 验证和启动
# ───────────────────────────────────────────────
step5_verify_start() {
    print_step "5/5" "验证和启动"

    # 验证飞书
    if command -v opencode-feishu &>/dev/null; then
        echo ""
        print_info "检查飞书连接..."
        if opencode-feishu doctor 2>/dev/null; then
            print_success "飞书连接正常"
        else
            print_warning "飞书连接检查未通过，请检查配置"
        fi
    fi

    echo ""
    print_info "配置完成！"
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  🎉 魂器初始配置完成！${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # 启动选项
    if [ "$EUID" -eq 0 ] || sudo -n true 2>/dev/null; then
        if [ "$NONINTERACTIVE" = "1" ]; then
            # 非交互模式：自动启动 systemd
            echo ""
            print_info "自动启动 systemd 服务..."
            sudo systemctl start "hunqi-core@${USER_NAME}" 2>/dev/null || print_warning "hunqi-core 启动失败"
            sleep 3
            sudo systemctl start "channel-feishu@${USER_NAME}" 2>/dev/null || print_warning "channel-feishu 启动失败"
            echo ""
            print_success "服务已启动"
            echo "  查看状态: sudo systemctl status channel-feishu@${USER_NAME}"
            echo "  查看日志: sudo journalctl -u channel-feishu@${USER_NAME} -f"
        else
            echo -e "${CYAN}启动方式选择:${NC}"
            echo ""
            echo "  1) systemd 后台运行（推荐，支持开机自启）"
            echo "  2) 前台运行（适合调试）"
            echo "  3) 暂不启动"
            echo ""

            local choice
            safe_read "  请选择 [1]: " choice
            choice="${choice:-1}"

            case "$choice" in
                1)
                    echo ""
                    print_info "启动 systemd 服务..."
                    sudo systemctl start "hunqi-core@${USER_NAME}" 2>/dev/null || print_warning "hunqi-core 启动失败"
                    sleep 3
                    sudo systemctl start "channel-feishu@${USER_NAME}" 2>/dev/null || print_warning "channel-feishu 启动失败"
                    echo ""
                    print_success "服务已启动"
                    echo "  查看状态: sudo systemctl status channel-feishu@${USER_NAME}"
                    echo "  查看日志: sudo journalctl -u channel-feishu@${USER_NAME} -f"
                    ;;
                2)
                    echo ""
                    print_info "前台启动..."
                    echo "  运行: cd $SCRIPT_DIR && hunqi start"
                    ;;
                *)
                    print_info "已跳过启动"
                    echo ""
                    echo "  后台启动: sudo systemctl start hunqi-core@${USER_NAME}"
                    echo "  前台启动: cd $SCRIPT_DIR && hunqi start"
                    ;;
            esac
        fi
    else
        echo "  前台启动: cd $SCRIPT_DIR && hunqi start"
        echo "  交互 TUI: cd $SCRIPT_DIR && hunqi interactive"
    fi

    echo ""
    echo "  其他常用命令:"
    echo "    hunqi doctor          # 系统诊断"
    echo "    hunqi status          # 查看状态"
    echo "    opencode-feishu setup # 重新配置飞书"
    echo ""
}

# ═══════════════════════════════════════════════
# 主程序
# ═══════════════════════════════════════════════

print_header

# 如果不在项目目录，尝试自动定位
if [ ! -f "$SCRIPT_DIR/package.json" ]; then
    if [ -f "${HOME_DIR}/.hunqi/agent-soul-framework/package.json" ]; then
        SCRIPT_DIR="${HOME_DIR}/.hunqi/agent-soul-framework"
        cd "$SCRIPT_DIR"
        print_info "自动定位到项目目录: $SCRIPT_DIR"
    else
        print_error "未找到魂器项目目录"
        exit 1
    fi
fi

step1_check_env
step2_env_config
step3_feishu
step4_qiwei
step5_verify_start
