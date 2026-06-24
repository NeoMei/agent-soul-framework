#!/usr/bin/env bash
#
# 魂器健康检查与自动恢复脚本
# 用途：检测 OpenCode serve 和飞书连接器状态，卡死时自动重启
#

set -e

PROJECT_DIR="$HOME/.hunqi/agent-soul-framework"
LOG_FILE="/tmp/hunqi-health-check.log"
OPENCODE_PORT="${OPENCODE_PORT:-19876}"
MAX_BUSY_SECONDS=600  # 10分钟认为会话卡死

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_opencode_serve() {
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$OPENCODE_PORT/session" 2>/dev/null || echo "000")
    if [ "$http_code" = "200" ]; then
        return 0
    else
        return 1
    fi
}

check_feishu_connector() {
    if pgrep -f "opencode-feishu" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

check_stuck_sessions() {
    local sessions_file="$HOME/.config/opencode/feishu-sessions.json"
    local has_stuck=0
    
    if [ ! -f "$sessions_file" ]; then
        return 0
    fi
    
    # 检查日志中是否有长时间 busy 的会话
    local current_time=$(date +%s%3N)
    local busy_threshold=$((MAX_BUSY_SECONDS * 1000))
    
    # 获取最近一条 busy 状态的日志时间
    local last_busy_time
    last_busy_time=$(grep '"status":"busy"' $HOME/.config/opencode/feishu.log 2>/dev/null | tail -1 | grep -o '"time":[0-9]*' | cut -d: -f2 || echo "0")
    
    if [ -n "$last_busy_time" ] && [ "$last_busy_time" != "0" ]; then
        local elapsed=$((current_time - last_busy_time))
        if [ "$elapsed" -gt "$busy_threshold" ]; then
            log "⚠️ 检测到会话已 busy 超过 $MAX_BUSY_SECONDS 秒"
            has_stuck=1
        fi
    fi
    
    return $has_stuck
}

restart_services() {
    log "🔄 开始重启魂器服务..."
    
    # 1. 停止现有服务
    log "  停止飞书连接器..."
    opencode-feishu stop 2>/dev/null || true
    
    log "  停止 OpenCode serve..."
    pkill -f "opencode serve --port $OPENCODE_PORT" 2>/dev/null || true
    
    sleep 3
    
    # 2. 清理 session 文件
    local sessions_file="$HOME/.config/opencode/feishu-sessions.json"
    if [ -f "$sessions_file" ]; then
        log "  清理 stuck sessions..."
        rm -f "$sessions_file"
    fi
    
    # 3. 启动 OpenCode serve
    log "  启动 OpenCode serve..."
    cd "$PROJECT_DIR"
    [ -f .env ] && export $(grep -v '^#' .env | xargs)
    nohup bash -c " opencode serve --port $OPENCODE_PORT > /tmp/opencode-serve.log 2>&1 &" >/dev/null 2>&1
    
    # 等待 serve 就绪
    local retries=0
    while ! check_opencode_serve; do
        sleep 2
        retries=$((retries + 1))
        if [ $retries -gt 15 ]; then
            log "❌ OpenCode serve 启动失败"
            return 1
        fi
    done
    log "  ✅ OpenCode serve 已就绪"
    
    # 4. 启动飞书连接器
    log "  启动飞书连接器..."
    cd "$PROJECT_DIR"
    export $(grep -v '^#' .env | xargs)
    opencode-feishu start --daemon
    
    sleep 2
    if check_feishu_connector; then
        log "  ✅ 飞书连接器已启动"
    else
        log "❌ 飞书连接器启动失败"
        return 1
    fi
    
    log "✅ 魂器服务重启完成"
    return 0
}

# ===== 主逻辑 =====

log "=== 魂器健康检查 ==="

need_restart=0

# 检查1: OpenCode serve
if ! check_opencode_serve; then
    log "❌ OpenCode serve 无响应 (端口 $OPENCODE_PORT)"
    need_restart=1
else
    log "✅ OpenCode serve 正常"
fi

# 检查2: 飞书连接器
if ! check_feishu_connector; then
    log "❌ 飞书连接器未运行"
    need_restart=1
else
    log "✅ 飞书连接器正常"
fi

# 检查3: 卡死的会话
if check_stuck_sessions; then
    log "❌ 检测到 stuck session"
    need_restart=1
else
    log "✅ 会话状态正常"
fi

# 执行重启
if [ "$need_restart" -eq 1 ]; then
    restart_services
else
    log "✅ 所有检查通过，无需操作"
fi
