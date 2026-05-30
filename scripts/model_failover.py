#!/usr/bin/env python3
"""
魂器模型降级管理器 — Model Failover Manager

功能：
- 监控主力模型可用性（通过探测请求）
- 连续失败时自动降级到备用模型
- 降级后定时尝试恢复主力模型
- 记录降级历史

降级链：
  Tier 1: kimi-for-coding/k2p6 (主力)
  Tier 2: alibaba-coding-plan-cn/qwen3.6-plus (备用1)
  Tier 3: zhipuai-coding-plan/glm-5.1 (备用2)

用法：
  python3 scripts/model_failover.py check    # 手动检查并可能触发降级
  python3 scripts/model_failover.py status   # 查看当前状态
  python3 scripts/model_failover.py reset    # 重置到主力模型
"""

import json
import os
import sys
import time
import subprocess
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
CONFIG_PATH = PROJECT_DIR / ".opencode" / "opencode.json"
STATE_PATH = PROJECT_DIR / "memory" / ".model_failover_state.json"
LOG_PATH = PROJECT_DIR / "memory" / ".model_failover.log"

# 降级链配置
FAILOVER_CHAIN = [
    {
        "id": "kimi-k2p6",
        "model": "kimi-for-coding/k2p6",
        "name": "Kimi K2.6 (主力)",
        "priority": 1,
    },
    {
        "id": "qwen3.6-plus",
        "model": "alibaba-coding-plan-cn/qwen3.6-plus",
        "name": "Qwen 3.6 Plus (备用1)",
        "priority": 2,
    },
    {
        "id": "glm-5.1",
        "model": "zhipuai-coding-plan/glm-5.1",
        "name": "GLM 5.1 (备用2)",
        "priority": 3,
    },
]

# 降级阈值
FAIL_THRESHOLD = 3          # 连续失败 3 次触发降级
RECOVERY_INTERVAL = 300     # 降级后每 300 秒（5分钟）尝试恢复主力模型
RECOVERY_SUCCESS_THRESHOLD = 2  # 连续成功 2 次才确认恢复


def log(msg):
    """记录日志"""
    ts = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def load_state():
    """加载降级状态"""
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "current_tier": 0,           # 当前使用的档位索引
        "consecutive_fails": 0,       # 连续失败次数
        "consecutive_success": 0,     # 连续成功次数
        "last_fail_time": None,       # 最后一次失败时间
        "last_check_time": None,      # 最后一次检查时间
        "downgrade_history": [],      # 降级历史记录
        "total_checks": 0,            # 总检查次数
    }


def save_state(state):
    """保存降级状态"""
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def load_config():
    """加载 opencode 配置"""
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_config(config):
    """保存 opencode 配置（原子写入 + 自动备份）"""
    import shutil

    # 1. 备份当前配置
    backup_path = CONFIG_PATH.with_suffix(f".json.backup.{datetime.now().strftime('%Y%m%d%H%M%S')}")
    if CONFIG_PATH.exists():
        shutil.copy2(CONFIG_PATH, backup_path)
        # 只保留最近5个备份
        backups = sorted(CONFIG_PATH.parent.glob("*.json.backup.*"), key=lambda p: p.stat().st_mtime)
        for old in backups[:-5]:
            old.unlink(missing_ok=True)

    # 2. 原子写入：先写临时文件，再rename
    temp_path = CONFIG_PATH.with_suffix(".json.tmp")
    try:
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_path, CONFIG_PATH)
    except Exception:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
        raise


def get_password():
    """从环境变量或 .env 读取 opencode serve 密码"""
    pwd = os.environ.get("OPENCODE_SERVER_PASSWORD", "")
    if not pwd:
        env_path = PROJECT_DIR / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("OPENCODE_SERVER_PASSWORD="):
                    pwd = line.split("=", 1)[1].strip()
                    break
    return pwd


def check_model_health(model_id=None, timeout=30):
    """
    检查模型健康状态
    通过创建临时 session 并发送简单请求来测试
    
    返回: (is_healthy, error_message, response_time_ms)
    """
    import base64
    
    pwd = get_password()
    headers = {"Content-Type": "application/json"}
    if pwd:
        token = base64.b64encode(f"opencode:{pwd}".encode()).decode()
        headers["Authorization"] = f"Basic {token}"
    
    server_url = "http://localhost:19876"
    
    try:
        # 1. 检查 server 是否运行
        req = urllib.request.Request(f"{server_url}/session", headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status not in (200, 201):
                return False, f"Server returned {resp.status}", 0
        
        # 2. 创建一个临时 session 来测试模型
        req = urllib.request.Request(
            f"{server_url}/session",
            data=json.dumps({"title": f"failover-check-{int(time.time())}"}).encode(),
            headers=headers,
            method="POST"
        )
        
        start_time = time.time()
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
            session_id = data.get("id")
            if not session_id:
                return False, "No session ID in response", 0
        
        # 3. 发送一个简单的消息请求（只测试连通性，不等待完整回复）
        req = urllib.request.Request(
            f"{server_url}/session/{session_id}/message",
            data=json.dumps({"parts": [{"type": "text", "text": "hi"}]}).encode(),
            headers=headers,
            method="POST"
        )
        
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            resp_data = resp.read()
            response_time = int((time.time() - start_time) * 1000)
            
            # 4. 清理临时 session
            try:
                del_req = urllib.request.Request(
                    f"{server_url}/session/{session_id}",
                    headers=headers,
                    method="DELETE"
                )
                urllib.request.urlopen(del_req, timeout=5)
            except Exception:
                pass
            
            # 检查响应状态
            if resp.status in (200, 201):
                return True, "OK", response_time
            else:
                return False, f"Message API returned {resp.status}", response_time
                
    except urllib.error.HTTPError as e:
        # 特定错误码判断
        if e.code == 429:
            return False, "Rate limited (429)", 0
        elif e.code == 503:
            return False, "Service unavailable (503)", 0
        elif e.code == 502:
            return False, "Bad gateway (502)", 0
        elif e.code == 504:
            return False, "Gateway timeout (504)", 0
        elif e.code == 401:
            return False, "Unauthorized (401) — check password", 0
        else:
            return False, f"HTTP {e.code}: {e.reason}", 0
    except urllib.error.URLError as e:
        return False, f"Connection error: {e.reason}", 0
    except TimeoutError:
        return False, "Timeout", 0
    except Exception as e:
        return False, f"Error: {str(e)[:100]}", 0


def switch_model(tier_index):
    """切换到指定档位的模型"""
    if tier_index < 0 or tier_index >= len(FAILOVER_CHAIN):
        log(f"[ERROR] Invalid tier index: {tier_index}")
        return False
    
    target = FAILOVER_CHAIN[tier_index]
    config = load_config()
    current_model = config.get("model", "unknown")
    
    if current_model == target["model"]:
        return True  # 已经是目标模型
    
    log(f"[SWITCH] {current_model} → {target['model']} ({target['name']})")
    
    # 修改配置
    config["model"] = target["model"]
    save_config(config)
    
    # 重启 opencode serve（发送 SIGHUP 或优雅重启）
    try:
        # 查找 opencode serve 进程并发送 SIGHUP
        result = subprocess.run(
            ["pgrep", "-f", "opencode serve"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            for pid in result.stdout.strip().split("\n"):
                if pid.strip():
                    try:
                        os.kill(int(pid.strip()), 1)  # SIGHUP
                        log(f"[RELOAD] Sent SIGHUP to opencode serve PID {pid}")
                    except Exception as e:
                        log(f"[WARN] Failed to send SIGHUP to PID {pid}: {e}")
        
        # 如果 SIGHUP 不支持，记录需要手动重启
        log("[INFO] Config updated. opencode serve will reload on next request.")
        return True
        
    except Exception as e:
        log(f"[ERROR] Failed to reload: {e}")
        return False


def check_and_failover():
    """检查并执行降级/恢复"""
    state = load_state()
    state["total_checks"] += 1
    state["last_check_time"] = datetime.now(timezone(timedelta(hours=8))).isoformat()
    
    current_tier = state["current_tier"]
    is_healthy, error_msg, response_time = check_model_health()
    
    log(f"[CHECK] Tier {current_tier+1} ({FAILOVER_CHAIN[current_tier]['name']}): "
        f"{'✅ Healthy' if is_healthy else '❌ Failed'} | {error_msg} | {response_time}ms")
    
    if is_healthy:
        # 健康状态
        state["consecutive_fails"] = 0
        state["consecutive_success"] += 1
        
        # 如果当前不在主力模型，且连续成功次数达到阈值，尝试恢复主力模型
        if current_tier > 0 and state["consecutive_success"] >= RECOVERY_SUCCESS_THRESHOLD:
            log(f"[RECOVER] Tier {current_tier+1} healthy for {state['consecutive_success']} checks, "
                f"attempting to restore Tier 1 (主力)")
            
            # 先临时切回主力模型测试
            test_config = load_config()
            original_model = test_config["model"]
            test_config["model"] = FAILOVER_CHAIN[0]["model"]
            save_config(test_config)
            
            # 等待一小会儿让配置生效
            time.sleep(2)
            
            # 测试主力模型
            is_tier1_healthy, tier1_error, tier1_time = check_model_health()
            
            if is_tier1_healthy:
                log(f"[RECOVER] ✅ Tier 1 (主力) is healthy ({tier1_time}ms), restoring...")
                state["current_tier"] = 0
                state["consecutive_success"] = 0
                state["downgrade_history"].append({
                    "time": datetime.now(timezone(timedelta(hours=8))).isoformat(),
                    "action": "restore",
                    "from": FAILOVER_CHAIN[current_tier]["id"],
                    "to": FAILOVER_CHAIN[0]["id"],
                    "reason": f"Tier {current_tier+1} stable, Tier 1 recovered",
                })
                save_state(state)
                return True
            else:
                log(f"[RECOVER] ❌ Tier 1 (主力) still unhealthy: {tier1_error}, staying at Tier {current_tier+1}")
                # 恢复原来的降级模型
                test_config["model"] = original_model
                save_config(test_config)
                state["consecutive_success"] = 0  # 重置成功计数
                save_state(state)
                return False
        
        save_state(state)
        return True
        
    else:
        # 失败状态
        state["consecutive_fails"] += 1
        state["consecutive_success"] = 0
        state["last_fail_time"] = datetime.now(timezone(timedelta(hours=8))).isoformat()
        
        log(f"[FAIL] Consecutive fails: {state['consecutive_fails']}/{FAIL_THRESHOLD}")
        
        if state["consecutive_fails"] >= FAIL_THRESHOLD:
            # 触发降级
            next_tier = current_tier + 1
            
            if next_tier >= len(FAILOVER_CHAIN):
                log(f"[ERROR] All tiers exhausted! Staying at last tier.")
                state["consecutive_fails"] = 0  # 重置，避免无限日志
                save_state(state)
                return False
            
            log(f"[DEGRADE] Triggering downgrade from Tier {current_tier+1} to Tier {next_tier+1}")
            
            if switch_model(next_tier):
                state["current_tier"] = next_tier
                state["consecutive_fails"] = 0
                state["consecutive_success"] = 0
                state["downgrade_history"].append({
                    "time": datetime.now(timezone(timedelta(hours=8))).isoformat(),
                    "action": "downgrade",
                    "from": FAILOVER_CHAIN[current_tier]["id"],
                    "to": FAILOVER_CHAIN[next_tier]["id"],
                    "reason": error_msg,
                })
                save_state(state)
                return True
            else:
                save_state(state)
                return False
        
        save_state(state)
        return False


def show_status():
    """显示当前状态"""
    state = load_state()
    config = load_config()
    current_model = config.get("model", "unknown")
    
    print("\n" + "=" * 60)
    print("🛡️  魂器模型降级管理器 — 状态")
    print("=" * 60)
    
    # 找到当前模型对应的档位
    current_tier = state["current_tier"]
    
    print(f"\n📊 当前配置:")
    print(f"   模型: {current_model}")
    print(f"   档位: Tier {current_tier+1} — {FAILOVER_CHAIN[current_tier]['name']}")
    
    print(f"\n📈 检查统计:")
    print(f"   总检查次数: {state['total_checks']}")
    print(f"   连续失败: {state['consecutive_fails']}/{FAIL_THRESHOLD}")
    print(f"   连续成功: {state['consecutive_success']}/{RECOVERY_SUCCESS_THRESHOLD}")
    
    if state["last_fail_time"]:
        print(f"   最后失败: {state['last_fail_time']}")
    if state["last_check_time"]:
        print(f"   最后检查: {state['last_check_time']}")
    
    print(f"\n📉 降级链:")
    for i, tier in enumerate(FAILOVER_CHAIN):
        marker = "👉 " if i == current_tier else "   "
        print(f"   {marker}Tier {i+1}: {tier['name']}")
    
    if state["downgrade_history"]:
        print(f"\n📜 降级历史 (最近 5 条):")
        for record in state["downgrade_history"][-5:]:
            action_emoji = "⬇️ " if record["action"] == "downgrade" else "⬆️ "
            print(f"   {action_emoji}{record['time'][:19]} | {record['action'].upper()}: "
                  f"{record['from']} → {record['to']} | {record['reason'][:50]}")
    
    print(f"\n{'=' * 60}\n")


def reset_to_primary():
    """强制重置到主力模型"""
    log("[RESET] Forcing reset to Tier 1 (主力)")
    state = load_state()
    state["current_tier"] = 0
    state["consecutive_fails"] = 0
    state["consecutive_success"] = 0
    state["downgrade_history"].append({
        "time": datetime.now(timezone(timedelta(hours=8))).isoformat(),
        "action": "reset",
        "from": FAILOVER_CHAIN[state["current_tier"]]["id"],
        "to": FAILOVER_CHAIN[0]["id"],
        "reason": "Manual reset",
    })
    save_state(state)
    switch_model(0)
    log("[RESET] Done")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\n用法:")
        print("  python3 scripts/model_failover.py check   # 检查并可能触发降级")
        print("  python3 scripts/model_failover.py status  # 查看状态")
        print("  python3 scripts/model_failover.py reset   # 强制重置到主力")
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd == "check":
        check_and_failover()
    elif cmd == "status":
        show_status()
    elif cmd == "reset":
        reset_to_primary()
    else:
        print(f"[ERROR] Unknown command: {cmd}")
        print("可用命令: check, status, reset")
        sys.exit(1)


if __name__ == "__main__":
    main()
