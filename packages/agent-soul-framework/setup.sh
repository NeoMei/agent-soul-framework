#!/bin/bash
# setup.sh - 魂器初始化脚本
# 一键检查和修复 .opencode/opencode.json 配置，确保插件注册、模型配置完整

set -e

cd "$(dirname "$0")"

OPENCODE_JSON=".opencode/opencode.json"
OPENCODE_EXAMPLE=".opencode/opencode.json.example"

echo "🚀 魂器初始化 (Agent Soul Framework Setup)"
echo ""

# ========== Step 1: 确保 opencode.json 存在 ==========
if [ ! -f "$OPENCODE_JSON" ]; then
    echo "📄 $OPENCODE_JSON 不存在，从模板创建..."
    if [ -f "$OPENCODE_EXAMPLE" ]; then
        cp "$OPENCODE_EXAMPLE" "$OPENCODE_JSON"
    else
        echo "❌ 错误: $OPENCODE_EXAMPLE 也不存在"
        exit 1
    fi
    echo "✅ 已创建 $OPENCODE_JSON"
    echo "⚠️  请编辑该文件填入你的 API key 和 provider 配置"
    echo ""
fi

# ========== Step 2: 用 Python 检查和修复 JSON 配置 ==========
python3 << 'PYTHON_SCRIPT'
import json
import sys

OPENCODE_JSON = ".opencode/opencode.json"

with open(OPENCODE_JSON, "r") as f:
    content = f.read()

try:
    config = json.loads(content)
except json.JSONDecodeError as e:
    print(f"❌ {OPENCODE_JSON} JSON 格式错误: {e}")
    sys.exit(1)

modified = False

# --- 2.1 检查并添加 plugin 配置 ---
if "plugin" not in config:
    config["plugin"] = ["./tools/read-plugin.js"]
    print("🔧 添加 plugin 配置: ./tools/read-plugin.js")
    modified = True
else:
    plugins = config["plugin"]
    if isinstance(plugins, list):
        if "./tools/read-plugin.js" not in plugins:
            plugins.append("./tools/read-plugin.js")
            print("🔧 添加 plugin 配置: ./tools/read-plugin.js")
            modified = True
        else:
            print("✅ plugin 配置已存在")
    else:
        config["plugin"] = ["./tools/read-plugin.js"]
        print("🔧 修复 plugin 配置: ./tools/read-plugin.js")
        modified = True

# --- 2.2 检查并添加 compaction 配置 ---
if "compaction" not in config:
    config["compaction"] = {
        "auto": True,
        "prune": True,
        "tail_turns": 3,
        "preserve_recent_tokens": 8000,
        "reserved": 16384
    }
    print("🔧 添加 compaction 配置")
    modified = True
else:
    print("✅ compaction 配置已存在")

# --- 2.3 检查 model 是否已设置 ---
if "model" not in config or not config["model"] or config["model"] == "your-default-model":
    print("⚠️  model 未配置，请在 {OPENCODE_JSON} 中设置默认模型")
else:
    print(f"✅ 默认模型: {config['model']}")

# --- 2.4 检查 provider 是否已设置 ---
if "provider" not in config or not config["provider"]:
    print("⚠️  provider 未配置，请在 {OPENCODE_JSON} 中设置 API provider")
else:
    providers = list(config["provider"].keys())
    print(f"✅ 已配置 providers: {', '.join(providers)}")

# --- 2.5 检查模型是否有 attachment/modalities/limit 配置 ---
if "provider" in config and isinstance(config["provider"], dict):
    for pname, pdata in config["provider"].items():
        if "models" in pdata and isinstance(pdata["models"], dict):
            for mname, mdata in pdata["models"].items():
                if isinstance(mdata, dict):
                    missing = []
                    if "attachment" not in mdata:
                        missing.append("attachment")
                    if "modalities" not in mdata:
                        missing.append("modalities")
                    if "limit" not in mdata:
                        missing.append("limit")
                    if missing:
                        print(f"⚠️  provider '{pname}' 模型 '{mname}' 缺少配置: {', '.join(missing)}")

# 保存修改
if modified:
    with open(OPENCODE_JSON, "w") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("")
    print("✅ 配置已自动修复并保存")
else:
    print("")
    print("✅ 配置检查通过，无需修改")

PYTHON_SCRIPT

echo ""
echo "📋 初始化完成"
echo ""
echo "下一步:"
echo "  1. 编辑 .opencode/opencode.json 填入 API key"
echo "  2. 运行 ./hunqi.sh interactive 启动交互模式"
echo ""
