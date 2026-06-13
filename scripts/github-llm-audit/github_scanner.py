#!/usr/bin/env python3
"""
GitHub 仓库扫描器
"""

import os
import re
import time
import base64
import requests
from urllib.parse import quote
from typing import List, Dict, Any, Optional

GITHUB_API_BASE = "https://api.github.com"
SENSITIVE_NAMES = ["env", "config", "key", "secret", "token", "api", "credential", "auth"]
TEXT_EXTENSIONS = {".py", ".js", ".ts", ".jsx", ".tsx", ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".env", ".md", ".txt", ".sh", ".bash", ".zsh", ".ps1", ".html", ".css", ".sql"}
SKIP_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".pdf", ".zip", ".tar", ".gz", ".rar", ".7z", ".mp3", ".mp4", ".woff", ".woff2", ".ttf", ".eot", ".otf", ".exe", ".dll", ".so", ".dylib", ".bin", ".lock"}


class GitHubScanner:
    def __init__(self, token: Optional[str] = None):
        self.token = token or os.environ.get("GITHUB_TOKEN", "")
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/vnd.github.v3+json", "User-Agent": "GitHub-LLM-Key-Audit/1.0"})
        if self.token:
            self.session.headers.update({"Authorization": f"token {self.token}"})

    def _get(self, url: str, params: Optional[Dict[str, Any]] = None, retries: int = 1) -> Optional[Any]:
        for attempt in range(retries + 1):
            try:
                resp = self.session.get(url, params=params, timeout=8)
                if resp.status_code == 200:
                    return resp.json()
                if resp.status_code == 404:
                    return None
                if resp.status_code == 403:
                    self._handle_rate_limit(resp)
                    continue
                return None
            except Exception:
                time.sleep(0.5)
        return None

    def _handle_rate_limit(self, response: requests.Response) -> None:
        remaining = int(response.headers.get("X-RateLimit-Remaining", 0))
        if remaining == 0:
            reset_at = int(response.headers.get("X-RateLimit-Reset", 0))
            wait = min(max(reset_at - int(time.time()) + 2, 5), 60)
            print(f"[RATE LIMIT] 等待 {wait} 秒...")
            time.sleep(wait)

    def search_repositories(self, language: str, per_page: int = 10, page: int = 1) -> List[Dict[str, Any]]:
        """搜索与 AI Agent / Agent 插件 / Agent Skill 相关的低星个人仓库"""
        agent_keywords = ["agent", "mcp", "llm", "skill", "ai", "plugin"]
        keyword_query = " OR ".join(agent_keywords)
        query = f"language:{language} created:>2026-03-01 stars:<10 fork:false ({keyword_query}) sort:updated"
        url = f"{GITHUB_API_BASE}/search/repositories"
        params = {"q": query, "per_page": min(per_page, 15), "page": page}
        data = self._get(url, params=params)
        if not data:
            return []
        repos = data.get("items", [])
        return [r for r in repos if r.get("size", 0) / 1024 < 5]

    def get_repo_tree(self, owner: str, repo: str) -> List[Dict[str, Any]]:
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/HEAD?recursive=1"
        data = self._get(url)
        return data.get("tree", []) if data else []

    def get_file_content(self, owner: str, repo: str, path: str) -> Optional[str]:
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{quote(path, safe='')}?ref=HEAD"
        data = self._get(url)
        if not data or "content" not in data:
            return None
        try:
            content = base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
            return content[:80 * 1024] if len(content) > 80 * 1024 else content
        except Exception:
            return None

    def scan_file(self, content: str, patterns: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        findings = []
        seen = set()
        for pattern in patterns:
            compiled = re.compile(pattern["regex"])
            for match in compiled.finditer(content):
                key = match.group(0)
                key_id = f"{pattern['platform']}:{key}"
                if key_id in seen:
                    continue
                seen.add(key_id)
                findings.append({"platform": pattern["platform"], "masked_key": mask_key(key), "full_length": len(key)})
        return findings

    def scan_repository(self, repo: Dict[str, Any], patterns: List[Dict[str, Any]]) -> Dict[str, Any]:
        owner = repo["owner"]["login"]
        repo_name = repo["name"]
        result = {
            "repo": repo_name,
            "owner": owner,
            "full_name": repo["full_name"],
            "url": repo["html_url"],
            "stars": repo.get("stargazers_count", 0),
            "language": repo.get("language", ""),
            "size_kb": repo.get("size", 0),
            "created_at": repo.get("created_at", ""),
            "findings": [],
            "scanned_files": 0
        }

        tree = self.get_repo_tree(owner, repo_name)
        candidates = []
        for item in tree:
            if item.get("type") != "blob":
                continue
            path = item.get("path", "")
            ext = os.path.splitext(path)[1].lower()
            if ext in SKIP_EXTENSIONS:
                continue
            if ext not in TEXT_EXTENSIONS and ".env" not in path.lower():
                continue
            score = 0
            lower_path = path.lower()
            for name in SENSITIVE_NAMES:
                if name in lower_path:
                    score += 10
            if ext in (".env", ".json", ".yaml", ".yml", ".toml", ".ini"):
                score += 5
            candidates.append((score, path))

        candidates.sort(key=lambda x: (-x[0], x[1]))
        selected = candidates[:5]

        for _, path in selected:
            time.sleep(0.15)
            content = self.get_file_content(owner, repo_name, path)
            if content is None:
                continue
            result["scanned_files"] += 1
            file_findings = self.scan_file(content, patterns)
            for finding in file_findings:
                finding["file_path"] = path
                result["findings"].append(finding)

        return result


def mask_key(key: str) -> str:
    key = key.strip()
    if len(key) <= 8:
        return "*" * len(key)
    return f"{key[:3]}{'*' * (len(key) - 6)}{key[-3:]}"
