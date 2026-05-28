#!/bin/bash
# 点点的语音生成脚本（自动v1/v2切换版）
# 使用智声云TTS生成语音，失败时自动切换版本

API_KEY="${DOUBAO_API_KEY:?DOUBAO_API_KEY not set}"
API_SECRET="${DOUBAO_API_SECRET:?DOUBAO_API_SECRET not set}"

if [ -z "$1" ]; then
    echo "用法: $0 <text> [output.wav]"
    echo "示例: $0 '你好呀' hello.wav"
    exit 1
fi

TEXT="$1"
OUTPUT="${2:-output.wav}"

# 生成签名
gen_signature() {
    local ts="$1"
    local msg="$ts"
    echo -n "$msg" | openssl dgst -sha256 -hmac "$API_SECRET" -binary | base64
}

# 发送任务
send_task() {
    local version="$1"
    local ts
    ts=$(date +%s)
    local sig
    sig=$(gen_signature "$ts")

    local json_payload
    json_payload=$(python3 -c "import json,sys; print(json.dumps({'voiceId':'30149','text':sys.argv[1],'language':'zh','fileFormat':'mp3'}))" "$TEXT")

    local resp
    resp=$(curl -s --connect-timeout 10 --max-time 60 -X POST "https://tts-api.dubbingx.com/${version}/addTtsTask" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $API_KEY" \
        -H "X-Timestamp: $ts" \
        -H "X-Signature: $sig" \
        -d "$json_payload")

    local task_id
    task_id=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('taskId',''))" 2>/dev/null)
    echo "$task_id|$ts|$sig"
}

# 查询任务
query_task() {
    local version="$1"
    local task_id="$2"
    local ts
    ts=$(date +%s)
    local sig
    sig=$(gen_signature "$ts")

    curl -s --connect-timeout 10 --max-time 60 -X POST "https://tts-api.dubbingx.com/${version}/getTtsTaskInfo/${task_id}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $API_KEY" \
        -H "X-Timestamp: $ts" \
        -H "X-Signature: $sig"
}

# 尝试创建任务，遍历v1/v2
VERSION=""
TASK_RESULT=""
for version in v1 v2 v1 v2; do
    if [ -z "$VERSION" ] || [ "$version" != "$VERSION" ]; then
        RESULT=$(send_task "$version")
        TASK_ID=$(echo "$RESULT" | cut -d'|' -f1)
        if [ -n "$TASK_ID" ]; then
            VERSION="$version"
            echo "任务已创建 (${version}), ID: $TASK_ID"
            break
        fi
    fi
done

if [ -z "$TASK_ID" ]; then
    echo "创建任务失败: $RESULT"
    exit 1
fi

# 轮询任务状态，失败时自动切换版本
LAST_VERSION="$VERSION"
for i in {1..30}; do
    sleep 2
    STATUS_RESP=$(query_task "$LAST_VERSION" "$TASK_ID")
    STATUS=$(echo "$STATUS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('status',''))" 2>/dev/null)
    echo "状态 (${LAST_VERSION}): $STATUS"

    if [ "$STATUS" = "Completed" ]; then
        FILE_URL=$(echo "$STATUS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('fileUrl',''))" 2>/dev/null)
        curl -s --connect-timeout 10 --max-time 120 -o "$OUTPUT" "$FILE_URL"
        echo "已保存到: $OUTPUT"
        exit 0
    elif [ "$STATUS" = "Failed" ]; then
        echo "生成失败"
        exit 1
    elif [ "$STATUS" = "" ]; then
        # 空状态，尝试切换版本
        if [ "$LAST_VERSION" = "v1" ]; then
            echo "v1 查询异常，切换到 v2..."
            LAST_VERSION="v2"
        else
            echo "v2 查询异常，切换到 v1..."
            LAST_VERSION="v1"
        fi
    fi
done

echo "超时"
exit 1
