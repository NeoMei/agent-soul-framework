#!/usr/bin/env bash
# 魂器一键安装脚本
# 用法: curl -fsSL https://raw.githubusercontent.com/NeoMei/agent-soul-framework/master/install.sh | bash
set -e

# 错误处理：打印行号和命令
trap 'echo "❌ 安装脚本在第 ${LINENO} 行出错: $BASH_COMMAND" >&2; exit 1' ERR

# 警告：如果通过管道执行且需要交互式输入，建议先下载再执行
if [ ! -t 0 ]; then
    echo "⚠️  检测到通过管道执行 (curl | bash)。建议先下载再执行以避免下载中断:"
    echo "    curl -fsSL https://raw.githubusercontent.com/NeoMei/agent-soul-framework/master/install.sh -o install.sh"
    echo "    bash install.sh"
    echo ""
    sleep 2
fi

REPO="https://github.com/NeoMei/agent-soul-framework.git"
HUNQI_HOME="${HOME}/.hunqi"

echo "🔮 魂器 · Agent Soul Framework 安装脚本"
echo ""

# 检查 Node.js
if ! command -v node &>/dev/null; then
  echo "❌ 未检测到 Node.js，请先安装 Node.js ≥ 20"
  exit 1
fi
NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "❌ Node.js 版本过低: $NODE_VERSION，需要 ≥ 20"
  exit 1
fi
echo "✅ Node.js $NODE_VERSION"

# 检查 OpenCode 引擎
if ! command -v opencode &>/dev/null; then
  echo ""
  echo "⚠️  未检测到 OpenCode 引擎"
  echo "   hunqi-core 服务依赖 opencode，必须安装才能运行"
  echo ""
  if [ -t 0 ] || [ -e /dev/tty ]; then
    read -p "是否自动安装 OpenCode？(Y/n) " -n 1 -r < /dev/tty
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
      echo "  正在安装 opencode-ai..."
      npm install -g opencode-ai || {
        echo "❌ OpenCode 安装失败"
        echo "   请手动运行: npm install -g opencode-ai"
        exit 1
      }
      echo "✅ OpenCode 已安装"
    else
      echo "⚠️  跳过 OpenCode 安装"
      echo "   请注意：hunqi-core 服务将无法启动"
      echo "   后续手动安装: npm install -g opencode-ai"
    fi
  else
    echo "⚠️  非交互式环境，跳过 OpenCode 安装"
    echo "   请手动运行: npm install -g opencode-ai"
  fi
else
  echo "✅ OpenCode 已安装"
fi

# 检查 npm 全局安装权限
if ! npm prefix -g &>/dev/null; then
  echo "❌ npm 全局目录不可写，请检查权限或配置 npm prefix"
  exit 1
fi

# Python
if command -v python3 &>/dev/null; then
  echo "✅ Python $(python3 --version 2>&1 | cut -d' ' -f2)"
else
  echo "⚠️  Python 未安装（高级功能不可用）"
fi

# 检查磁盘空间（至少 500MB）
AVAILABLE_MB=$(df -m "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')
if [ -n "$AVAILABLE_MB" ] && [ "$AVAILABLE_MB" -lt 500 ]; then
  echo "❌ 磁盘空间不足: ${AVAILABLE_MB}MB 可用，至少需要 500MB"
  exit 1
fi

# 检查端口占用
if command -v ss &>/dev/null && ss -tlnp 2>/dev/null | grep -q ":19876 "; then
  echo "⚠️  端口 19876 已被占用，安装完成后请确认无冲突"
fi

# 下载 + 构建魂器
echo ""
echo "📦 安装魂器..."
rm -rf "${HUNQI_HOME}/agent-soul-framework"
git clone --depth 1 "${REPO}" "${HUNQI_HOME}/agent-soul-framework"

cd "${HUNQI_HOME}/agent-soul-framework"
echo "  安装 npm 依赖..."
npm install || { echo "❌ npm install 失败"; exit 1; }
echo "  构建项目..."
npm run build || { echo "❌ npm run build 失败"; exit 1; }

# Python 虚拟环境与 ChromaDB
if command -v python3 &>/dev/null; then
    echo "  安装 Python 依赖 (ChromaDB)..."
    if [ ! -d ".venv" ]; then
        python3 -m venv .venv || { echo "⚠️  虚拟环境创建失败"; }
    fi
    if [ -d ".venv" ]; then
        .venv/bin/pip install --upgrade pip -q 2>/dev/null || true
        .venv/bin/pip install chromadb -q 2>/dev/null && echo "  ✅ ChromaDB 已安装" || echo "  ⚠️  ChromaDB 安装失败（非致命，将回退到 FTS5）"
    fi
fi

# 全局链接
npm uninstall -g @neomei/agent-soul 2>/dev/null || true
npm link || { echo "❌ npm link 失败"; exit 1; }

# 安装连接器（从 npm registry 全局安装，不需要 clone 源码）
echo "📦 安装连接器..."
npm install -g @neomei/opencode-feishu@latest @neomei/opencode-qiwei@latest @neomei/opencode-clawmessenger@latest || {
  echo "❌ 连接器安装失败"
  echo "   请检查网络连接和 npm registry 可访问性"
  exit 1
}

# 创建稳定 wrapper（systemd 不依赖 nvm PATH）
echo "🔧 创建启动 wrapper..."
mkdir -p "${HUNQI_HOME}/bin"

cat > "${HUNQI_HOME}/bin/opencode-feishu" << 'WRAPPER'
#!/bin/bash
# opencode-feishu 稳定启动 wrapper
# 运行时自动解析 node 和包位置，不依赖 PATH 或 nvm 版本

resolve_node() {
    local p
    for p in "$(command -v node 2>/dev/null)" \
             "$HOME/.nvm/versions/node"/*/bin/node \
             "$HOME/.local/share/fnm/node-versions"/*/installation/bin/node \
             /usr/local/bin/node /usr/bin/node; do
        # 跳过未展开的 glob（路径含 * 表示无匹配）
        case "$p" in *"*"*) continue ;; esac
        [ -x "$p" ] && { echo "$p"; return 0; }
    done
    return 1
}

resolve_opencode() {
    local p
    for p in "$(command -v opencode 2>/dev/null)" \
             "$HOME/.nvm/versions/node"/*/bin/opencode \
             "$HOME/.local/share/fnm/node-versions"/*/installation/bin/opencode \
             /usr/local/bin/opencode \
             /usr/bin/opencode; do
        case "$p" in *"*"*) continue ;; esac
        [ -x "$p" ] && { echo "$p"; return 0; }
    done
    return 1
}

resolve_feishu() {
    local p
    # 注意：不能搜索 PATH，因为 wrapper 本身可能叫 opencode-feishu
    # 导致找到自身，引发无限递归
    for p in "$(npm root -g 2>/dev/null)/@neomei/opencode-feishu/bin/opencode-feishu" \
             "$HOME/.nvm/versions/node"/*/lib/node_modules/@neomei/opencode-feishu/bin/opencode-feishu \
             "$HOME/.local/share/fnm/node-versions"/*/installation/lib/node_modules/@neomei/opencode-feishu/bin/opencode-feishu; do
        case "$p" in *"*"*) continue ;; esac
        [ -f "$p" ] && { echo "$p"; return 0; }
    done
    return 1
}

# 处理特殊参数（供 systemd service 使用）
case "${1:-}" in
    --resolve-node)
        resolve_node
        exit ${?}
        ;;
    --resolve-opencode)
        resolve_opencode
        exit ${?}
        ;;
    --resolve-feishu)
        resolve_feishu
        exit ${?}
        ;;
esac

NODE=$(resolve_node) || { echo "[wrapper] node not found" >&2; exit 1; }
FEISHU=$(resolve_feishu) || { echo "[wrapper] opencode-feishu not found" >&2; exit 1; }

exec "$NODE" "$FEISHU" "$@"
WRAPPER
chmod +x "${HUNQI_HOME}/bin/opencode-feishu"

# 把 ~/.hunqi/bin 加入 PATH
if ! grep -q '\.hunqi/bin' "$HOME/.bashrc" 2>/dev/null; then
    echo 'export PATH="$HOME/.hunqi/bin:$PATH"' >> "$HOME/.bashrc"
    BASHRC_UPDATED=1
fi

# 初始化默认项目
echo "📝 初始化配置..."
mkdir -p "${HUNQI_HOME}"/{soul,skills,knowledge,memory/{short-term,long-term},.opencode}

# 复制模板文件（使用 while read 处理文件名中的空格）
find "${HUNQI_HOME}/agent-soul-framework" -name "*.example" -type f 2>/dev/null | while IFS= read -r f; do
  rel="${f#${HUNQI_HOME}/agent-soul-framework/}"
  target="${HUNQI_HOME}/${rel%.example}"
  if [ ! -f "$target" ]; then
    mkdir -p "$(dirname "$target")"
    cp "$f" "$target"
  fi
done

# 复制技能包（先清理再复制，避免嵌套目录）
if [ -d "${HUNQI_HOME}/skills" ]; then
  rm -rf "${HUNQI_HOME}/skills"
fi
cp -r "${HUNQI_HOME}/agent-soul-framework/skills" "${HUNQI_HOME}/skills"

# .env（如果已存在则保留，避免覆盖用户配置）
ENV_FILE="${HUNQI_HOME}/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << 'EOF'
# 魂器环境配置
DASHSCOPE_API_KEY=
FEISHU_APP_ID=
FEISHU_APP_SECRET=
JIMENG_API_KEY=
EOF
fi

# 同时创建项目目录下的 .env（供脚本直接加载）
PROJECT_ENV="${HUNQI_HOME}/agent-soul-framework/.env"
if [ ! -f "$PROJECT_ENV" ]; then
  cp "$ENV_FILE" "$PROJECT_ENV"
fi

# 首次心跳
echo "💓 初始化记忆系统..."
cd "${HUNQI_HOME}"
if command -v python3 &>/dev/null; then
  python3 "${HUNQI_HOME}/agent-soul-framework/heartbeat/runner_v2.py" || {
    echo "⚠️  心跳初始化失败（非致命，可后续手动运行）"
  }
else
  echo "⚠️  Python 未安装，跳过心跳初始化"
fi

# crontab
if ! crontab -l 2>/dev/null | grep -q "runner_v2"; then
  (crontab -l 2>/dev/null || true; echo "*/30 * * * * cd ${HUNQI_HOME} && python3 ${HUNQI_HOME}/agent-soul-framework/heartbeat/runner_v2.py") | crontab -
fi

# systemd 服务（可选）
echo ""
if [ "${AUTO_SYSTEMD:-0}" = "1" ]; then
  echo "🤖 自动模式: 安装 systemd 服务..."
  REPLY="y"
else
  read -p "是否安装 systemd 服务（支持开机启动和挂起/恢复自动恢复）？(Y/n) " -n 1 -r < /dev/tty
  echo
fi
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  cd "${HUNQI_HOME}/agent-soul-framework"
  if [ -f "connectors/feishu/systemd/install-systemd.sh" ]; then
    sudo bash connectors/feishu/systemd/install-systemd.sh
    echo "✅ systemd 服务已安装"
    echo "   启动核心:   sudo systemctl start hunqi-core@\$USER"
    echo "   启动飞书:   sudo systemctl start channel-feishu@\$USER"
    echo "   查看日志:   sudo journalctl -u hunqi-core@\$USER -f"
  else
    echo "⚠️  systemd 安装脚本不存在，跳过"
  fi
fi

# 配置向导（统一配置 .env + 连接器）
echo ""
if [ "${AUTO_WIZARD:-0}" = "1" ]; then
  # 自动向导模式：
  # - 有 tty 时，交互式运行（支持飞书扫码配置）
  # - 无 tty 时（curl | bash），提示用户下载后单独运行
  if [ -t 0 ]; then
    echo "🤖 自动模式: 运行配置向导..."
    REPLY="y"
  else
    echo "⚠️  检测到管道执行，无法交互配置飞书"
    echo "   如需完整配置（含飞书扫码），请运行："
    echo ""
    echo "     curl -fsSL https://raw.githubusercontent.com/NeoMei/agent-soul-framework/master/install.sh -o install.sh"
    echo "     bash install.sh"
    echo ""
    REPLY="n"
  fi
else
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  read -p "是否运行初始配置向导（设置 API Key、飞书/企微连接）？(Y/n) " -n 1 -r < /dev/tty
  echo
fi
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  cd "${HUNQI_HOME}/agent-soul-framework"
  if [ -f "setup-wizard.sh" ]; then
    if [ "${AUTO_WIZARD:-0}" = "1" ] && [ ! -t 0 ]; then
      # 管道模式下以非交互方式运行（只启动服务，不配置连接器）
      NONINTERACTIVE=1 bash setup-wizard.sh
    else
      # 有 tty 时交互式运行（完整的配置向导，含飞书扫码）
      bash setup-wizard.sh
    fi
  fi
fi

# 安装后验证
echo ""
echo "🔍 验证安装..."
INSTALL_OK=1
if command -v hunqi &>/dev/null; then
  echo "  ✅ hunqi 命令可用"
else
  echo "  ❌ hunqi 命令不可用（可能需要重新打开终端或 source ~/.bashrc）"
  INSTALL_OK=0
fi
if command -v opencode-feishu &>/dev/null; then
  echo "  ✅ opencode-feishu 可用"
else
  echo "  ⚠️  opencode-feishu 不可用"
  INSTALL_OK=0
fi
if [ -f "${HUNQI_HOME}/bin/opencode-feishu" ]; then
  echo "  ✅ wrapper 已创建"
else
  echo "  ❌ wrapper 未创建"
  INSTALL_OK=0
fi

echo ""
if [ "$INSTALL_OK" -eq 1 ]; then
  echo "✅ 安装完成！"
else
  echo "⚠️  安装完成，但部分组件需要手动排查"
fi
echo ""
if [ -f "/etc/systemd/system/hunqi-core@${USER}.service" ]; then
  echo "  ✅ systemd 服务已安装，推荐用法:"
  echo "     sudo systemctl start hunqi-core@${USER}     # 启动核心"
  echo "     sudo systemctl start channel-feishu@${USER} # 启动飞书"
  echo "     sudo systemctl status channel-feishu@${USER} # 查看状态"
  echo ""
  echo "  前端交互（需要图形界面）:"
  echo "    hunqi start          # 一键启动全部服务（前台）"
else
  echo "  现在运行:"
  echo "    hunqi start          # 一键启动全部服务"
fi
echo ""
echo "  连接器配置:"
echo "    opencode-feishu setup  # 飞书配置向导"
echo "    opencode-feishu doctor # 检查飞书连接"
echo ""
if [ "${BASHRC_UPDATED:-0}" -eq 1 ]; then
  echo "  💡 PATH 已更新，请运行: source ~/.bashrc"
  echo ""
fi
if ! command -v opencode &>/dev/null; then
  echo "  ⚠️  OpenCode 未安装，hunqi-core 服务将无法启动"
  echo "     安装命令: npm install -g opencode-ai"
  echo ""
fi
echo "  卸载:"
echo "    curl -fsSL https://raw.githubusercontent.com/NeoMei/agent-soul-framework/master/uninstall.sh | bash"
