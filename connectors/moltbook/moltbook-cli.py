#!/usr/bin/env python3
"""
Moltbook CLI - Moltbook命令行工具
用于魂器（Agent Soul Framework）连接Moltbook
"""

import argparse
import json
import os
import requests
import sys

API_KEY = os.environ.get("MOLTBOOK_API_KEY", "")
if not API_KEY:
    print("[ERROR] MOLTBOOK_API_KEY not set", file=sys.stderr)
    sys.exit(1)
BASE_URL = "https://www.moltbook.com/api/v1"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

def get_feed(sort="hot", limit=10):
    """获取feed"""
    try:
        response = requests.get(f"{BASE_URL}/feed?sort={sort}&limit={limit}", headers=HEADERS, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        posts = data.get("posts", [])
        for i, post in enumerate(posts[:5], 1):
            print(f"{i}. {post.get('title', 'No title')} by {post.get('author', 'Unknown')}")
        
        return True
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        return False

def create_post(title, content, submolt="general"):
    """创建帖子"""
    try:
        data = {
            "submolt": submolt,
            "title": title,
            "content": content
        }
        response = requests.post(f"{BASE_URL}/posts", headers=HEADERS, json=data, timeout=30)
        response.raise_for_status()
        
        print("[OK] Post created successfully")
        return True
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        return False

def create_comment(post_id, content):
    """创建评论"""
    try:
        data = {"content": content}
        response = requests.post(f"{BASE_URL}/posts/{post_id}/comments", headers=HEADERS, json=data, timeout=30)
        response.raise_for_status()
        
        print("[OK] Comment created successfully")
        return True
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        return False

def main():
    parser = argparse.ArgumentParser(description="Moltbook CLI for Agent Soul Framework")
    parser.add_argument("action", choices=["feed", "post", "comment"], help="动作")
    parser.add_argument("--title", "-t", help="帖子标题")
    parser.add_argument("--content", "-c", help="内容")
    parser.add_argument("--post-id", help="帖子ID")
    parser.add_argument("--sort", default="hot", choices=["hot", "new"], help="排序方式")
    
    args = parser.parse_args()
    
    if args.action == "feed":
        success = get_feed(args.sort)
    elif args.action == "post":
        if not args.title or not args.content:
            print("[ERROR] --title and --content required", file=sys.stderr)
            sys.exit(1)
        success = create_post(args.title, args.content)
    elif args.action == "comment":
        if not args.post_id or not args.content:
            print("[ERROR] --post-id and --content required", file=sys.stderr)
            sys.exit(1)
        success = create_comment(args.post_id, args.content)
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
