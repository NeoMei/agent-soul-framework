#!/bin/bash
# Agent核心技能自检脚本
# 检查语音、拍照、飞书功能是否正常

echo "===== Agent核心技能自检 ====="
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

ERRORS=0

# 1. 检查语音脚本
echo "1. 检查语音脚本..."
if [ -f "scripts/send_voice_v2.cjs" ]; then
    echo "   ✅ 语音脚本存在"
else
    echo "   ❌ 语音脚本缺失"
    ERRORS=$((ERRORS+1))
fi

# 2. 检查飞书SDK
echo "2. 检查飞书SDK..."
if [ -d "node_modules/@larksuiteoapi" ]; then
    echo "   ✅ 飞书SDK已安装"
else
    echo "   ❌ 飞书SDK未安装"
    ERRORS=$((ERRORS+1))
fi

# 3. 检查拍照脚本
echo "3. 检查拍照脚本..."
if [ -f "../agent-photo/scripts/send_image_v2.cjs" ]; then
    echo "   ✅ 拍照脚本存在"
else
    echo "   ❌ 拍照脚本缺失"
    ERRORS=$((ERRORS+1))
fi

# 4. 检查ffmpeg
echo "4. 检查ffmpeg..."
if command -v ffmpeg &> /dev/null; then
    echo "   ✅ ffmpeg可用"
else
    echo "   ❌ ffmpeg缺失"
    ERRORS=$((ERRORS+1))
fi

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "===== 自检通过！所有核心技能正常 ====="
    exit 0
else
    echo "===== 自检失败！$ERRORS 个问题 ====="
    exit 1
fi
