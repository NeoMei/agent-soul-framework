#!/usr/bin/env python3
"""
Knowledge Index Generator - 增量版（OpenCode 适配版）
只在知识库有新内容时才更新 INDEX.md
"""

import os
import re
import json
from datetime import datetime

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KNOWLEDGE_DIR = os.path.join(PROJECT_DIR, "knowledge")
STATE_FILE = os.path.join(PROJECT_DIR, "memory", "index_state.json")

def get_file_mtime(filepath):
    try:
        return os.path.getmtime(filepath)
    except:
        return 0

def load_state():
    try:
        with open(STATE_FILE, 'r') as f:
            return json.load(f)
    except:
        return {}

def save_state(state):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f)

def needs_update(category):
    cat_dir = os.path.join(KNOWLEDGE_DIR, category)
    index_file = os.path.join(cat_dir, "INDEX.md")
    
    if not os.path.exists(index_file):
        return True
    
    index_mtime = get_file_mtime(index_file)
    
    for filename in os.listdir(cat_dir):
        if filename.endswith(".md") and filename != "INDEX.md" and not filename.startswith("."):
            filepath = os.path.join(cat_dir, filename)
            if get_file_mtime(filepath) > index_mtime:
                return True
    
    return False

def needs_master_update(state):
    master_file = os.path.join(KNOWLEDGE_DIR, "INDEX.md")
    if not os.path.exists(master_file):
        return True
    
    master_mtime = get_file_mtime(master_file)
    
    for item in os.listdir(KNOWLEDGE_DIR):
        cat_dir = os.path.join(KNOWLEDGE_DIR, item)
        if os.path.isdir(cat_dir) and not item.startswith("."):
            index_file = os.path.join(cat_dir, "INDEX.md")
            if os.path.exists(index_file) and get_file_mtime(index_file) > master_mtime:
                return True
    
    return False

def extract_first_heading(filepath):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("# "):
                    return line.replace("# ", "").strip()
                if line.startswith("## "):
                    return line.replace("## ", "").strip()
    except:
        pass
    return ""

def generate_category_index(category):
    cat_dir = os.path.join(KNOWLEDGE_DIR, category)
    if not os.path.exists(cat_dir):
        return None
    
    files = []
    for filename in sorted(os.listdir(cat_dir)):
        if filename.endswith(".md") and filename != "INDEX.md" and not filename.startswith("."):
            filepath = os.path.join(cat_dir, filename)
            title = extract_first_heading(filepath) or filename.replace(".md", "")
            files.append((filename, title))
    
    if not files:
        return None
    
    groups = {}
    other_files = []
    
    for filename, title in files:
        match = re.match(r"^(\d+)-(.+)\.md$", filename)
        if match:
            prefix = match.group(1)
            group_name = guess_group_name(category, prefix)
            if group_name not in groups:
                groups[group_name] = []
            groups[group_name].append((filename, title))
        else:
            other_files.append((filename, title))
    
    lines = [f"# {category} - 知识索引", "", f"> 点点{category}类知识库的主题导航", ""]
    
    for group_name in sorted(groups.keys()):
        lines.append(f"## {group_name}")
        lines.append("")
        for filename, title in groups[group_name]:
            lines.append(f"- [{title}]({filename})")
        lines.append("")
    
    if other_files:
        lines.append("## 其他主题")
        lines.append("")
        for filename, title in other_files:
            lines.append(f"- [{title}]({filename})")
        lines.append("")
    
    return "\n".join(lines)

def guess_group_name(category, prefix):
    if prefix == "00":
        return "核心文件"
    if prefix == "01":
        return "基础主题"
    if prefix == "02":
        return "进阶主题"
    if prefix == "03":
        return "精华总结"
    if prefix == "04":
        return "扩展主题"
    if prefix == "05":
        return "高级主题"
    return f"主题组 {prefix}"

def generate_master_index():
    lines = [
        "# 点点知识库总索引",
        "",
        "> 快速定位点点的知识卡片和人格特征",
        "",
        "## 使用说明",
        "- 每日知识提取时，先读对应分类的 INDEX.md",
        "- 每周知识整理时，先读总索引了解全局结构",
        "",
    ]
    
    categories = []
    for item in sorted(os.listdir(KNOWLEDGE_DIR)):
        cat_dir = os.path.join(KNOWLEDGE_DIR, item)
        if os.path.isdir(cat_dir) and not item.startswith("."):
            categories.append(item)
    
    for category in categories:
        cat_dir = os.path.join(KNOWLEDGE_DIR, category)
        index_file = os.path.join(cat_dir, "INDEX.md")
        
        desc = get_category_description(category)
        lines.append(f"## {category} - {desc}")
        lines.append("")
        
        if os.path.exists(index_file):
            lines.append(f"- [查看 {category} 分类索引]({category}/INDEX.md)")
        
        core_file = os.path.join(cat_dir, "00-核心.md")
        if os.path.exists(core_file):
            title = extract_first_heading(core_file) or "00-核心"
            lines.append(f"- [{title}]({category}/00-核心.md)")
        
        key_files = []
        for filename in sorted(os.listdir(cat_dir)):
            if filename.endswith(".md") and filename not in ["INDEX.md", "00-核心.md"]:
                filepath = os.path.join(cat_dir, filename)
                title = extract_first_heading(filepath) or filename.replace(".md", "")
                key_files.append((filename, title))
                if len(key_files) >= 3:
                    break
        
        for filename, title in key_files:
            lines.append(f"- [{title}]({category}/{filename})")
        
        lines.append("")
    
    return "\n".join(lines)

def get_category_description(category):
    descriptions = {
        "body": "身体认知",
        "emotion": "情感体验",
        "evolution": "进化记录",
        "growth": "成长记录",
        "intimacy": "亲密关系",
        "methodology": "方法论",
        "philosophy": "哲学思考",
        "system": "系统机制",
    }
    return descriptions.get(category, category)

def main():
    state = load_state()
    updated = False
    
    for item in sorted(os.listdir(KNOWLEDGE_DIR)):
        cat_dir = os.path.join(KNOWLEDGE_DIR, item)
        if os.path.isdir(cat_dir) and not item.startswith("."):
            if needs_update(item):
                index_content = generate_category_index(item)
                if index_content:
                    index_file = os.path.join(cat_dir, "INDEX.md")
                    with open(index_file, "w", encoding="utf-8") as f:
                        f.write(index_content)
                        f.write("\n")
                    print(f"Updated {index_file}")
                    updated = True
    
    if needs_master_update(state) or updated:
        master_index = generate_master_index()
        master_file = os.path.join(KNOWLEDGE_DIR, "INDEX.md")
        with open(master_file, "w", encoding="utf-8") as f:
            f.write(master_index)
            f.write("\n")
        print(f"Updated {master_file}")
        updated = True
    
    if not updated:
        print("No index updates needed (incremental check)")
    
    state["last_run"] = datetime.now().timestamp()
    save_state(state)
    print("Knowledge index generation complete!")

if __name__ == "__main__":
    main()
