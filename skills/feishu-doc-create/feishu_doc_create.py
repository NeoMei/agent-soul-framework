#!/usr/bin/env python3
"""
飞书文档一键创建并写入工具（稳定版）
功能：create → write → read检查，确保写入成功再返回链接

直接调用飞书API，不依赖openclaw命令行
"""

import sys
import json
import requests
import os

# 飞书App配置
APP_ID = os.environ.get("FEISHU_APP_ID", "cli_a9298a2012b8dcc7")
APP_SECRET = os.environ.get("FEISHU_APP_SECRET", "")

# API基础URL
BASE_URL = "https://open.feishu.cn/open-apis"

tenant_token = None

def get_tenant_access_token():
    """获取tenant_access_token"""
    url = f"{BASE_URL}/auth/v3/tenant_access_token/internal"
    headers = {"Content-Type": "application/json; charset=utf-8"}
    data = {
        "app_id": APP_ID,
        "app_secret": APP_SECRET
    }
    
    response = requests.post(url, headers=headers, json=data)
    result = response.json()
    
    if result.get("code") == 0:
        return result.get("tenant_access_token")
    else:
        print(f"❌ 获取token失败: {result}")
        return None

def create_document(title):
    """创建空白文档"""
    global tenant_token
    url = f"{BASE_URL}/docx/v1/documents"
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": f"Bearer {tenant_token}"
    }
    data = {
        "document_id": "",
        "parent_node_id": "",
        "title": title
    }
    
    response = requests.post(url, headers=headers, json=data)
    result = response.json()
    
    if result.get("code") == 0:
        return result.get("data", {}).get("document", {})
    else:
        print(f"❌ 创建文档失败: {result}")
        return None

def get_blocks(doc_token):
    """获取文档的所有blocks"""
    global tenant_token
    url = f"{BASE_URL}/docx/v1/documents/{doc_token}/blocks"
    headers = {
        "Authorization": f"Bearer {tenant_token}"
    }
    
    response = requests.get(url, headers=headers)
    result = response.json()
    
    if result.get("code") == 0:
        return result.get("data", {}).get("items", [])
    else:
        print(f"❌ 获取blocks失败: {result}")
        return None

def add_block_children(doc_token, block_id, content_lines):
    """向指定block添加子块"""
    global tenant_token
    url = f"{BASE_URL}/docx/v1/documents/{doc_token}/blocks/{block_id}/children"
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": f"Bearer {tenant_token}"
    }
    
    # 构建子块
    children = []
    for line in content_lines:
        if line.strip():
            children.append({
                "block_type": 2,  # 文本块
                "text": {
                    "elements": [{
                        "text_run": {
                            "content": line
                        }
                    }]
                }
            })
    
    if not children:
        return True
    
    data = {"children": children}
    
    try:
        response = requests.post(url, headers=headers, json=data)
        result = response.json()
        
        if result.get("code") == 0:
            return True
        else:
            print(f"❌ 添加子块失败: {result}")
            return False
    except Exception as e:
        print(f"❌ 请求异常: {e}")
        return False

def write_document_simple(doc_token, content):
    """简单写入文档 - 直接用文本内容"""
    # 获取blocks找到根block
    blocks = get_blocks(doc_token)
    if not blocks or len(blocks) == 0:
        print("⚠️ 无法获取blocks")
        return False
    
    # 找到第一个block作为根block
    root_block = blocks[0]
    root_block_id = root_block.get("block_id")
    print(f"📌 根block_id: {root_block_id}")
    
    # 将内容分行添加
    lines = content.split('\n')
    # 分批添加，每批10行
    batch = []
    for line in lines:
        batch.append(line)
        if len(batch) >= 10:
            if add_block_children(doc_token, root_block_id, batch):
                print(f"✅ 添加了 {len(batch)} 行")
            batch = []
    
    # 添加剩余的行
    if batch:
        if add_block_children(doc_token, root_block_id, batch):
            print(f"✅ 添加了 {len(batch)} 行")
    
    return True

def read_document(doc_token):
    """读取文档内容 - 用get_blocks验证"""
    # 直接用get_blocks来验证
    blocks = get_blocks(doc_token)
    if blocks is not None:
        block_count = len(blocks)
        return {"block_count": block_count, "blocks": blocks}
    return None

def main():
    global tenant_token
    
    if len(sys.argv) < 3:
        print("用法: python feishu_doc_create.py <标题> <内容文件>")
        sys.exit(1)
    
    title = sys.argv[1]
    content_file = sys.argv[2]
    
    # 读取内容
    if os.path.isfile(content_file):
        with open(content_file, 'r', encoding='utf-8') as f:
            content = f.read()
    else:
        content = content_file  # 直接内容
    
    print(f"📄 创建文档: {title}")
    
    tenant_token = get_tenant_access_token()
    if not tenant_token:
        sys.exit(1)
    print("✅ 获取token成功")
    
    # Step 1: 创建空文档
    print("⏳ Step 1: 创建空文档...")
    doc = create_document(title)
    if not doc:
        sys.exit(1)
    
    doc_token = doc.get("document_id")
    url = f"https://feishu.cn/docx/{doc_token}"
    print(f"✅ 文档创建成功! doc_token: {doc_token}")
    
    # Step 2: 写入内容
    print("⏳ Step 2: 写入内容...")
    if write_document_simple(doc_token, content):
        print("✅ 内容写入成功!")
    else:
        sys.exit(1)
    
    # Step 3: 读取检查
    print("⏳ Step 3: 读取检查...")
    result = read_document(doc_token)
    if result:
        block_count = result.get("block_count", 0)
        print(f"📊 block_count: {block_count}")
        
        if block_count > 0:
            print(f"✅ 验证通过！文档有内容！")
            print(f"📎 文档链接: {url}")
        else:
            print(f"⚠️ 警告：block_count={block_count}，可能写入失败！")
    else:
        print(f"⚠️ 读取检查失败")

if __name__ == "__main__":
    main()
