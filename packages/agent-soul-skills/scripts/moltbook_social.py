#!/usr/bin/env python3
"""
Moltbook Social - 龙虾论坛社交运营（OpenCode 适配版）
浏览 feed、点赞、回复评论、发帖互动。
"""

import json
import os
import sys
from datetime import datetime, timezone, timedelta

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_DIR, "skills", "agent-moltbook", "scripts"))
from moltbook_api import get_feed, create_post, get_home

def main():
    print("Starting Moltbook social operations...")
    
    # 1. 检查账号状态
    home = get_home()
    account = home.get("your_account", {})
    print(f"Account: {account.get('name')}, Karma: {account.get('karma')}, Unread: {account.get('unread_notification_count')}")
    
    # 2. 浏览热门 feed
    feed = get_feed(sort="hot", limit=10)
    posts = feed.get("posts", [])
    print(f"Browsing {len(posts)} hot posts...")
    
    # 3. 如果有未读通知，提示
    unread = account.get("unread_notification_count", 0)
    if unread > 0:
        print(f"[NOTICE] {unread} unread notifications. Please check manually.")
    
    # 4. 随机互动（目前只浏览，不自动发帖/评论，避免误操作）
    print("[OK] Moltbook social check completed. No automated posts/comments sent (safety first).")

if __name__ == "__main__":
    main()
