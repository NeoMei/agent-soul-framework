#!/bin/bash
# 点点的传图网站上传脚本
# 用法: ./upload_image.sh <图片路径> [permission]
# permission: 1=公开(默认), 0=私有

IMG_PATH="$1"
PERMISSION="${2:-1}"
TOKEN="227|RVBZauHbNKIbf3XFNdfM3w2T9feeTeXFuq5Fw6Yf"

if [ -z "$IMG_PATH" ] || [ ! -f "$IMG_PATH" ]; then
    echo "用法: $0 <图片路径> [permission]"
    exit 1
fi

RESULT=$(curl -s --max-time 30 -X POST "https://imgtg.com/api/v1/upload" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/json" \
    -F "file=@$IMG_PATH" \
    -F "permission=$PERMISSION")

URL=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['links']['url'])" 2>/dev/null)

if [ -n "$URL" ]; then
    echo "$URL"
else
    echo "上传失败: $RESULT" >&2
    exit 1
fi
