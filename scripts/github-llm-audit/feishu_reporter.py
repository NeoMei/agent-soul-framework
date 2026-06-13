#!/usr/bin/env python3
"""
飞书文档报告生成与通知
"""

import json
import os
import re
import requests
import time
from typing import List, Dict, Any, Optional
from pathlib import Path

FEISHU_CONFIG_PATH = os.path.expanduser("~/.config/opencode/feishu.json")


def get_feishu_credentials() -> tuple:
    if not os.path.exists(FEISHU_CONFIG_PATH):
        return None, None
    with open(FEISHU_CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    return cfg.get("appId", ""), cfg.get("appSecret", "") or os.environ.get("FEISHU_APP_SECRET", "")


def get_tenant_access_token(app_id: str, app_secret: str) -> Optional[str]:
    url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
    try:
        resp = requests.post(url, json={"app_id": app_id, "app_secret": app_secret}, timeout=10)
        data = resp.json()
        if data.get("code") == 0:
            return data.get("tenant_access_token")
    except Exception:
        pass
    return None


def upload_markdown_file(token: str, md_content: str, file_name: str) -> Optional[str]:
    tmp_path = Path(f"/tmp/{file_name}")
    tmp_path.write_text(md_content, encoding="utf-8")
    url = "https://open.feishu.cn/open-apis/drive/v1/files/upload_all"
    headers = {"Authorization": f"Bearer {token}"}
    file_size = os.path.getsize(tmp_path)
    with open(tmp_path, "rb") as f:
        files = {"file": (file_name, f, "text/markdown")}
        data = {"file_name": file_name, "parent_type": "explorer", "parent_node": "", "size": str(file_size)}
        try:
            resp = requests.post(url, headers=headers, data=data, files=files, timeout=30)
            result = resp.json()
            if result.get("code") == 0:
                return result["data"]["file_token"]
            print(f"[WARN] Upload file failed: {result}")
        except Exception as e:
            print(f"[WARN] Upload file exception: {e}")
    return None


def create_import_task(token: str, file_token: str, file_name: str) -> Optional[str]:
    url = "https://open.feishu.cn/open-apis/drive/v1/import_tasks"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"}
    body = {"file_extension": "md", "file_token": file_token, "type": "docx", "file_name": file_name, "point": {"mount_type": 1, "mount_key": ""}}
    try:
        resp = requests.post(url, headers=headers, json=body, timeout=15)
        result = resp.json()
        if result.get("code") == 0:
            return result["data"]["ticket"]
        print(f"[WARN] Create import task failed: {result}")
    except Exception as e:
        print(f"[WARN] Create import task exception: {e}")
    return None


def poll_import_result(token: str, ticket: str, max_wait: int = 120) -> Optional[str]:
    url = f"https://open.feishu.cn/open-apis/drive/v1/import_tasks/{ticket}"
    headers = {"Authorization": f"Bearer {token}"}
    start = time.time()
    while time.time() - start < max_wait:
        try:
            resp = requests.get(url, headers=headers, params={"line": 1}, timeout=15)
            result = resp.json()
            if result.get("code") == 0:
                job = result["data"]["result"]
                status = job.get("job_status")
                if status == 0:
                    return job.get("url")
                if status in (1, 2):
                    print(f"[INFO] Import in progress... status={status}")
                    time.sleep(3)
                    continue
                print(f"[WARN] Import failed: {job}")
                return None
            return None
        except Exception:
            time.sleep(3)
    print("[WARN] Import poll timeout")
    return None


def normalize_doc_url(url: str) -> str:
    if not url:
        return url
    match = re.search(r"/docx/([a-zA-Z0-9]+)", url)
    if match:
        return f"https://www.feishu.cn/docx/{match.group(1)}"
    return url


def generate_markdown_report(scan_date: str, language: str, repositories: List[Dict[str, Any]], total_findings: int) -> str:
    repo_with_findings = [r for r in repositories if r["findings"]]
    lines = [
        f"# GitHub LLM API Key 安全审计报告",
        "",
        f"**扫描日期**：{scan_date}",
        f"**扫描语言**：{language}",
        f"**扫描仓库数**：{len(repositories)}",
        f"**疑似泄露数**：{total_findings}",
        "",
        "---",
        "",
        "## 合规声明",
        "",
        "本报告仅用于安全审计和研究目的。",
        "报告中所有 API Key 均已脱敏处理，仅显示前3后3位。",
        "扫描过程遵守 GitHub API 速率限制。",
        "",
        "---",
        "",
        "## 扫描概况",
        "",
        f"- 总扫描仓库：{len(repositories)} 个",
        f"- 发现问题仓库：{len(repo_with_findings)} 个",
        f"- 疑似泄露条目：{total_findings} 条",
        "",
        "---",
        "",
        "## 发现列表",
        ""
    ]
    if not repo_with_findings:
        lines.append("今日未发现疑似 LLM API Key 泄露。")
    else:
        for idx, repo in enumerate(repo_with_findings, 1):
            lines.extend([
                f"### {idx}. {repo['full_name']}",
                "",
                f"- 仓库链接：{repo['url']}",
                f"- 作者：{repo['owner']} ｜ Stars：{repo['stars']} ｜ 语言：{repo['language']} ｜ 大小：{repo['size_kb']} KB",
                f"- 创建时间：{repo['created_at']} ｜ 扫描文件数：{repo['scanned_files']}",
                ""
            ])
            for finding in repo["findings"]:
                lines.append(f"- **平台**：{finding['platform']} ｜ **文件**：`{finding['file_path']}` ｜ **Key**：`{finding['masked_key']}`（长度 {finding['full_length']}）")
            lines.append("")
    lines.extend([
        "---",
        "",
        "## 披露建议",
        "",
        "对于发现的泄露仓库，建议采取以下步骤：",
        "",
        "1. 通过 GitHub Security Advisory 或私信仓库作者进行负责任披露。",
        "2. 建议作者立即撤销并轮换暴露的 API Key。",
        "3. 检查仓库历史提交记录，确保密钥不会残留在 Git 历史里。",
        "4. 使用 .gitignore 和 secrets 扫描工具防止再次泄露。",
        ""
    ])
    return "\n".join(lines)


def get_default_meizong_chat_id() -> str:
    """从飞书会话配置中读取第一个 p2p chat_id"""
    sessions_file = os.path.expanduser("~/.config/opencode/feishu-sessions.json")
    if not os.path.exists(sessions_file):
        return ""
    try:
        with open(sessions_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        for s in data.get("sessions", []):
            if s.get("chatType") == "p2p":
                return s.get("chatId", "")
    except Exception:
        pass
    return ""


def send_report_to_meizong(doc_url: str, scan_date: str, language: str, total_findings: int, repo_count: int) -> bool:
    """发送飞书消息通知梅总（使用 chat_id）"""
    meizong_chat_id = os.environ.get("FEISHU_MEIZONG_CHAT_ID", "") or get_default_meizong_chat_id()
    if not meizong_chat_id:
        print("[WARN] FEISHU_MEIZONG_CHAT_ID not set and no p2p session found, skip notification")
        return False
    app_id, app_secret = get_feishu_credentials()
    if not app_id or not app_secret:
        print("[WARN] Feishu credentials not found")
        return False
    token = get_tenant_access_token(app_id, app_secret)
    if not token:
        return False
    url = "https://open.feishu.cn/open-apis/im/v1/messages"
    params = {"receive_id_type": "chat_id"}
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"}
    message = f"""梅总，今日 GitHub LLM API Key 安全审计报告已生成。

📅 扫描日期：{scan_date}
💻 扫描语言：{language}
📦 扫描仓库：{repo_count} 个
⚠️ 疑似泄露：{total_findings} 条

📄 报告链接：{doc_url}

——点点安全审计助手"""
    body = {"receive_id": meizong_chat_id, "msg_type": "text", "content": json.dumps({"text": message})}
    try:
        resp = requests.post(url, params=params, headers=headers, json=body, timeout=10)
        data = resp.json()
        if data.get("code") == 0:
            print(f"[OK] Notification sent to Meizong")
            return True
        print(f"[WARN] Send message failed: {data}")
    except Exception as e:
        print(f"[WARN] Send message exception: {e}")
    return False


def create_and_send_report(scan_date: str, language: str, repositories: List[Dict[str, Any]], total_findings: int) -> Optional[str]:
    app_id, app_secret = get_feishu_credentials()
    if not app_id or not app_secret:
        print("[FAIL] Feishu credentials not found")
        return None
    token = get_tenant_access_token(app_id, app_secret)
    if not token:
        return None
    file_name = f"github-llm-audit-{scan_date}-{language.lower()}.md"
    md_content = generate_markdown_report(scan_date, language, repositories, total_findings)
    file_token = upload_markdown_file(token, md_content, file_name)
    if not file_token:
        return None
    ticket = create_import_task(token, file_token, file_name.replace(".md", ""))
    if not ticket:
        return None
    doc_url = poll_import_result(token, ticket)
    if not doc_url:
        return None
    doc_url = normalize_doc_url(doc_url)
    send_report_to_meizong(doc_url, scan_date, language, total_findings, len(repositories))
    return doc_url
