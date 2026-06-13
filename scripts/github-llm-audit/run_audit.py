#!/usr/bin/env python3
"""
GitHub LLM API Key 安全审计 - 主入口
每天 14:38 执行，扫描低星个人项目中的 LLM API Key 泄露
支持一天多次执行，自动轮换 page 避免重复扫描
"""

import os
import sys
import json
import argparse
from datetime import datetime, timezone, timedelta
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(Path(__file__).parent))

from github_scanner import GitHubScanner
from key_patterns import PATTERNS
from feishu_reporter import create_and_send_report

STATE_FILE = PROJECT_DIR / "logs" / "github-llm-audit-state.json"


def now_beijing():
    return datetime.now(timezone(timedelta(hours=8)))


def get_language_for_date(date: datetime) -> str:
    """根据日期计算当天扫描语言（Python → JavaScript → TypeScript 三日循环）"""
    base_date = datetime(2026, 6, 14, tzinfo=timezone(timedelta(hours=8)))
    delta = (date.date() - base_date.date()).days
    languages = ["Python", "JavaScript", "TypeScript"]
    return languages[delta % 3]


def load_env():
    """加载 .env 文件"""
    env_path = PROJECT_DIR / ".env"
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key not in os.environ:
                        os.environ[key] = value


def load_state() -> dict:
    """加载执行状态"""
    if not STATE_FILE.exists():
        return {}
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(state: dict) -> None:
    """保存执行状态"""
    STATE_FILE.parent.mkdir(exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def get_next_page(state: dict, scan_date: str, language: str) -> int:
    """获取本次执行应使用的 page（1-3 循环）"""
    date_state = state.setdefault(scan_date, {})
    lang_state = date_state.setdefault(language, {"last_page": 0})
    last_page = lang_state.get("last_page", 0)
    next_page = (last_page % 3) + 1
    lang_state["last_page"] = next_page
    return next_page


def main():
    parser = argparse.ArgumentParser(description="GitHub LLM API Key 安全审计")
    parser.add_argument("--language", "-l", type=str, choices=["python", "javascript", "typescript"], help="指定扫描语言")
    parser.add_argument("--date", "-d", type=str, help="指定扫描日期，格式 YYYY-MM-DD")
    parser.add_argument("--dry-run", action="store_true", help="只执行扫描，不生成飞书文档和通知")
    args = parser.parse_args()

    load_env()

    if args.date:
        scan_date = args.date
        try:
            now = datetime.strptime(args.date, "%Y-%m-%d").replace(tzinfo=timezone(timedelta(hours=8)))
        except ValueError:
            print("[ERROR] 日期格式错误，应为 YYYY-MM-DD")
            sys.exit(1)
    else:
        now = now_beijing()
        scan_date = now.strftime("%Y-%m-%d")

    language_map = {"python": "Python", "javascript": "JavaScript", "typescript": "TypeScript"}
    language = language_map.get(args.language, args.language.capitalize()) if args.language else get_language_for_date(now)

    state = load_state()
    page = get_next_page(state, scan_date, language)

    print(f"=== GitHub LLM API Key 安全审计 | {scan_date} | {language} | page={page} ===")

    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        print("[WARN] GITHUB_TOKEN not set, using unauthenticated requests")

    scanner = GitHubScanner(token=token)

    print(f"[STEP 1] 搜索 {language} 低星仓库（page {page}）...")
    repos = scanner.search_repositories(language.lower(), per_page=10, page=page)
    print(f"[OK] 找到 {len(repos)} 个符合条件的仓库")

    print("[STEP 2] 扫描仓库中的 LLM API Key...")
    all_results = []
    for idx, repo in enumerate(repos, 1):
        print(f"  [{idx}/{len(repos)}] 扫描 {repo['full_name']}...")
        result = scanner.scan_repository(repo, PATTERNS)
        all_results.append(result)
        finding_count = len(result["findings"])
        if finding_count > 0:
            print(f"    ⚠️ 发现 {finding_count} 条疑似泄露")
        else:
            print(f"    ✅ 未发现问题")

    total_findings = sum(len(r["findings"]) for r in all_results)
    print(f"\n[SUMMARY] 扫描仓库：{len(all_results)} 个，疑似泄露：{total_findings} 条")

    if not args.dry_run:
        print("[STEP 3] 生成飞书文档并通知梅总...")
        doc_url = create_and_send_report(scan_date, language, all_results, total_findings)

        if doc_url:
            print(f"[OK] 报告已生成：{doc_url}")
        else:
            print("[FAIL] 报告生成失败")
            sys.exit(1)

    # 保存状态（dry-run 也保存，避免测试影响后续正式执行可调整）
    save_state(state)

    log_dir = PROJECT_DIR / "logs"
    log_dir.mkdir(exist_ok=True)
    with open(log_dir / "github-llm-audit.log", "a", encoding="utf-8") as f:
        doc_url_str = doc_url if not args.dry_run else "dry-run"
        f.write(f"{now.isoformat()} [{language}] page={page} repos={len(all_results)} findings={total_findings} doc={doc_url_str}\n")


if __name__ == "__main__":
    main()
