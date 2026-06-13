#!/usr/bin/env bash
# 魂器卸载脚本
# 用法: curl -fsSL https://raw.githubusercontent.com/NeoMei/agent-soul-framework/master/uninstall.sh | bash
set -e

# 错误处理：打印行号和命令
trap 'echo "❌ 卸载脚本在第 ${LINENO} 行出错: $BASH_COMMAND" >&2; exit 1' ERR

echo "🔮 魂器 · Agent Soul Framework 卸载"
echo ""

# 确认卸载
echo "⚠️  此操作将删除 ~/.hunqi、~/.config/opencode 和相关配置"
read -rp "确认卸载？(y/N) " CONFIRM < /dev/tty
echo
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "已取消"
  exit 0
fi

# 停止 systemd 服务
echo "🛑 停止 systemd 服务..."
for svc in hunqi-core channel-feishu hunqi-feishu; do
  if systemctl is-active --quiet "${svc}@${USER}" 2>/dev/null; then
    if sudo systemctl stop "${svc}@${USER}" 2>/dev/null; then
      echo "  ✅ ${svc}@${USER} 已停止"
    else
      echo "  ⚠️  ${svc}@${USER} 停止失败"
    fi
  else
    echo "  ⏭️  ${svc}@${USER} (未运行)"
  fi
done

# 停止运行中的进程（精确匹配，避免误杀）
echo "🛑 停止运行中的进程..."

# 安全 kill：检查 PID 文件存在且内容有效
safe_kill_pidfile() {
  local pidfile="$1"
  local name="$2"
  if [ -f "$pidfile" ]; then
    local pid
    pid=$(cat "$pidfile" 2>/dev/null | tr -d '[:space:]')
    if [ -n "$pid" ] && [ "$pid" -gt 0 ] 2>/dev/null && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && echo "  ✅ $name (PID: $pid) 已停止" || echo "  ⚠️  $name (PID: $pid) 停止失败"
    else
      echo "  ⏭️  $name (无有效进程)"
    fi
  fi
}

safe_kill_pidfile "${HOME}/.config/opencode/feishu.pid" "opencode-feishu"
safe_kill_pidfile "${HOME}/.config/opencode/qiwei.pid" "opencode-qiwei"

# 只杀监听 19876 端口的 opencode serve，避免误杀其他实例
PORT="${OPENCODE_PORT:-19876}"
SERVE_PID=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | sed -n 's/.*pid=\([0-9]*\).*/\1/p')
if [ -n "$SERVE_PID" ]; then
  if kill -0 "$SERVE_PID" 2>/dev/null; then
    kill "$SERVE_PID" 2>/dev/null && echo "  ✅ opencode serve (PID: $SERVE_PID, 端口: $PORT) 已停止" || echo "  ⚠️  停止失败"
  else
    echo "  ⏭️  opencode serve (PID: $SERVE_PID 不存在)"
  fi
fi

sleep 1

# 卸载 npm 全局包（保留 opencode 引擎）
echo "📦 卸载 npm 包..."
for pkg in @neomei/agent-soul @neomei/opencode-feishu @neomei/opencode-qiwei; do
  if npm uninstall -g "$pkg" 2>/dev/null; then
    echo "  ✅ $pkg"
  else
    echo "  ⏭️  $pkg (未安装或移除失败)"
  fi
done
echo "  ⏭️  opencode-ai (保留，可能被其他工具使用)"

# 移除项目目录
echo "🗑️  移除数据目录..."
if [ -d "${HOME}/.hunqi" ]; then
  rm -rf "${HOME}/.hunqi"
  echo "  ✅ ~/.hunqi 已移除"
else
  echo "  ⏭️  ~/.hunqi 不存在"
fi

# 移除配置文件
echo "🗑️  移除配置文件..."
if [ -d "${HOME}/.config/opencode" ]; then
  rm -rf "${HOME}/.config/opencode"
  echo "  ✅ ~/.config/opencode 已移除"
else
  echo "  ⏭️  ~/.config/opencode 不存在"
fi

# 清理 crontab
echo "📅 清理 crontab..."
if crontab -l 2>/dev/null | grep -q "heartbeat_wrapper\|runner_v2"; then
  crontab -l 2>/dev/null | grep -v "heartbeat_wrapper\|runner_v2" | crontab -
  echo "  ✅ 心跳任务已移除"
else
  echo "  ⏭️  无心跳任务"
fi

# 清理 .bashrc 中的 PATH
echo "📅 清理 shell 配置..."
if grep -q '\.hunqi/bin' "${HOME}/.bashrc" 2>/dev/null; then
  # 创建临时文件，移除包含 .hunqi/bin 的行
  grep -v '\.hunqi/bin' "${HOME}/.bashrc" > "${HOME}/.bashrc.tmp" && mv "${HOME}/.bashrc.tmp" "${HOME}/.bashrc"
  echo "  ✅ ~/.bashrc PATH 已清理"
else
  echo "  ⏭️  ~/.bashrc 无需清理"
fi

# 移除 systemd 服务文件
echo "🗑️  移除 systemd 服务..."
for svc in hunqi-core channel-feishu hunqi-feishu; do
  svc_file="/etc/systemd/system/${svc}@.service"
  if [ -f "$svc_file" ]; then
    if sudo rm -f "$svc_file" 2>/dev/null; then
      echo "  ✅ ${svc}@.service 已移除"
    else
      echo "  ⚠️  ${svc}@.service 移除失败（可能需要 sudo）"
    fi
  fi
done
if command -v systemctl &>/dev/null; then
  sudo systemctl daemon-reload 2>/dev/null || true
fi

echo ""
echo "✅ 卸载完成！"
echo ""
echo "  已移除:"
echo "    - 全局命令: hunqi, opencode-feishu, opencode-qiwei"
echo "    - 数据目录: ~/.hunqi/"
echo "    - 配置文件: ~/.config/opencode/"
echo "    - crontab 心跳任务"
echo "    - systemd 服务文件"
echo "    - ~/.bashrc PATH 配置"
echo ""
echo "  请运行: source ~/.bashrc"
