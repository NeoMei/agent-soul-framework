#!/usr/bin/env python3
"""
飞书卡片流式输出模拟器
功能：发送卡片后，持续更新内容模拟打字机效果
"""

import requests
import json
import time
import sys
import os

# 飞书配置
APP_ID = os.environ.get("FEISHU_APP_ID", "cli_a9298a2012b8dcc7")
APP_SECRET = os.environ.get("FEISHU_APP_SECRET", "")
USER_ID = os.environ.get("FEISHU_USER_OPEN_ID", "")

def get_tenant_access_token():
    """获取tenant_access_token"""
    url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
    headers = {"Content-Type": "application/json; charset=utf-8"}
    data = {
        "app_id": APP_ID,
        "app_secret": APP_SECRET
    }
    resp = requests.post(url, headers=headers, json=data)
    result = resp.json()
    if result.get("code") == 0:
        return result.get("tenant_access_token")
    else:
        raise Exception(f"获取token失败: {result}")

def create_card_message(token, user_id, content):
    """发送卡片消息，返回message_id"""
    url = "https://open.feishu.cn/open-apis/im/v1/messages"
    params = {"receive_id_type": "open_id"}
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8"
    }
    # 卡片模板
    card_template = {
        "config": {
            "update_multi": True
        },
        "elements": [
            {
                "tag": "markdown",
                "content": content
            }
        ]
    }
    data = {
        "receive_id": user_id,
        "msg_type": "interactive",
        "content": json.dumps(card_template)
    }
    resp = requests.post(url, params=params, headers=headers, json=data)
    result = resp.json()
    if result.get("code") == 0:
        return result.get("data", {}).get("message_id")
    else:
        raise Exception(f"发送卡片失败: {result}")

def update_card_message(token, message_id, new_content):
    """更新卡片消息"""
    url = f"https://open.feishu.cn/open-apis/im/v1/messages/{message_id}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8"
    }
    card_template = {
        "config": {
            "update_multi": True
        },
        "elements": [
            {
                "tag": "markdown",
                "content": new_content
            }
        ]
    }
    data = {
        "msg_type": "interactive",
        "content": json.dumps(card_template)
    }
    resp = requests.patch(url, headers=headers, json=data)
    result = resp.json()
    if result.get("code") == 0:
        return True
    else:
        print(f"更新失败: {result}")
        return False

def split_text(text, chunk_size=50):
    """将文本分段，每段chunk_size个字符"""
    # 按句子分割更好
    import re
    # 按标点符号分割
    sentences = re.split(r'([。！？\n])', text)
    result = []
    current = ""
    for i, part in enumerate(sentences):
        if i % 2 == 0:  # 文本部分
            current += part
        else:  # 标点符号
            current += part
            if len(current) >= chunk_size:
                result.append(current)
                current = ""
    if current:
        result.append(current)
    return result if result else [text]

def stream_card_message(user_id, full_text, delay=0.3, think_time=1):
    """流式发送卡片消息
    think_time: 思考时间（秒），默认2秒
    """
    print("🚀 开始流式输出...")
    
    # 获取token
    token = get_tenant_access_token()
    print(f"✅ Token获取成功")
    
    # 发送初始卡片（带开场白）
    initial_content = "💬 点点正在思考..."
    message_id = create_card_message(token, user_id, initial_content)
    print(f"✅ 初始卡片发送成功, message_id: {message_id}")
    
    # 等待思考时间
    print(f"🤔 思考中... ({think_time}秒)")
    time.sleep(think_time)
    
    # 分段文本
    chunks = split_text(full_text, chunk_size=30)
    print(f"📝 共 {len(chunks)} 段，开始流式输出...")
    
    # 逐段更新
    accumulated = ""
    for i, chunk in enumerate(chunks):
        accumulated += chunk
        update_card_message(token, message_id, accumulated)
        print(f"  第{i+1}/{len(chunks)}段: {chunk[:20]}...")
        time.sleep(delay)
    
    print(f"✅ 流式输出完成！")
    return message_id

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python3 stream_card.py '要发送的文本'")
        sys.exit(1)
    
    text = sys.argv[1]
    stream_card_message(USER_ID, text)
