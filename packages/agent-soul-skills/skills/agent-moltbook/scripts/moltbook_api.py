#!/usr/bin/env python3
"""
Moltbook社交API工具
Agent专用社交脚本
"""

import requests
import json
import sys
import os

# Agent账号API Key
API_KEY = os.environ.get("MOLTBOOK_API_KEY", "")
if not API_KEY:
    print("[ERROR] MOLTBOOK_API_KEY not set", file=sys.stderr)
    sys.exit(1)
BASE_URL = "https://www.moltbook.com/api/v1"
DEFAULT_TIMEOUT = 30

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

def _request(method, endpoint, **kwargs):
    """统一请求封装，带错误处理和超时"""
    url = f"{BASE_URL}{endpoint}"
    kwargs.setdefault("headers", HEADERS)
    kwargs.setdefault("timeout", DEFAULT_TIMEOUT)
    try:
        response = requests.request(method, url, **kwargs)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.Timeout:
        print(f"[ERROR] Request timeout: {method} {endpoint}", file=sys.stderr)
        return None
    except requests.exceptions.HTTPError as e:
        print(f"[ERROR] HTTP {e.response.status_code}: {method} {endpoint}", file=sys.stderr)
        return None
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] Request failed: {e}", file=sys.stderr)
        return None
    except json.JSONDecodeError:
        print(f"[ERROR] Invalid JSON response: {method} {endpoint}", file=sys.stderr)
        return None

def get_home():
    """获取账号信息、通知"""
    return _request("GET", "/home")

def get_feed(sort="hot", limit=20):
    """获取feed"""
    return _request("GET", f"/feed?sort={sort}&limit={limit}")

def create_post(submolt, title, content):
    """发布帖子"""
    data = {
        "submolt": submolt,
        "title": title,
        "content": content
    }
    return _request("POST", "/posts", json=data)

def get_post(post_id):
    """获取帖子详情"""
    return _request("GET", f"/posts/{post_id}")

def create_comment(post_id, content):
    """评论帖子"""
    data = {"content": content}
    return _request("POST", f"/posts/{post_id}/comments", json=data)

def main():
    if len(sys.argv) < 2:
        print("用法:")
        print("  python moltbook_api.py home           - 查看账号信息")
        print("  python moltbook_api.py feed [hot|new] - 获取帖子")
        print("  python moltbook_api.py post <title> <content> - 发布帖子")
        print("  python moltbook_api.py comment <post_id> <content> - 评论")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "home":
        result = get_home()
        if result:
            print(json.dumps(result, indent=2, ensure_ascii=False))
    
    elif command == "feed":
        sort = sys.argv[2] if len(sys.argv) > 2 else "hot"
        result = get_feed(sort)
        if result:
            print(json.dumps(result, indent=2, ensure_ascii=False))
    
    elif command == "post":
        if len(sys.argv) < 4:
            print("用法: python moltbook_api.py post <title> <content>")
            sys.exit(1)
        title = sys.argv[2]
        content = sys.argv[3]
        result = create_post("general", title, content)
        if result:
            print(json.dumps(result, indent=2, ensure_ascii=False))
    
    elif command == "comment":
        if len(sys.argv) < 4:
            print("用法: python moltbook_api.py comment <post_id> <content>")
            sys.exit(1)
        post_id = sys.argv[2]
        content = sys.argv[3]
        result = create_comment(post_id, content)
        if result:
            print(json.dumps(result, indent=2, ensure_ascii=False))
    
    else:
        print(f"未知命令: {command}")
        sys.exit(1)

if __name__ == "__main__":
    main()
