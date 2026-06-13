#!/usr/bin/env python3
"""每日摘要生成器 - Daily digest generator.

从 memory/MM-DD-YYYY.md 和 memory/previousday.md 提取关键内容，
生成 journals/digest/digest-YYYY-MM-DD.md。
"""
from datetime import date, timedelta
import os
import re

def read_text(p):
    try:
        with open(p, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return ''

def extract_section(text, marker):
    lines = text.splitlines()
    collecting = False
    items = []
    for line in lines:
        if re.match(rf"^\s*{re.escape(marker)}\s*:?", line, flags=re.IGNORECASE):
            collecting = True
            continue
        if collecting:
            if line.strip().startswith('-'):
                items.append(line.strip().lstrip('- ').rstrip())
            elif line.strip() == '' or line.strip().startswith('#'):
                break
            else:
                if items:
                    items[-1] = items[-1] + ' ' + line.strip()
                else:
                    if line.strip():
                        items.append(line.strip())
    return items

def gather_digest(base_dir, today):
    date_str = today.isoformat()
    yesterday = today - timedelta(days=1)
    y_str = yesterday.isoformat()

    mem_today = os.path.join(base_dir, 'memory', f"{date_str}.md")
    mem_yest = os.path.join(base_dir, 'memory', f"{y_str}.md")

    text_today = read_text(mem_today)
    text_yest = read_text(mem_yest)

    # 中文关键词优先，英文/法文作备选
    dec = (extract_section(text_today, '决策') or extract_section(text_today, '决定') 
           or extract_section(text_today, 'Decision') or extract_section(text_today, 'Décision'))
    les = (extract_section(text_today, '学习') or extract_section(text_today, 'Lesson') 
           or extract_section(text_today, 'Leçon'))
    act = (extract_section(text_today, '行动') or extract_section(text_today, '下一步') 
           or extract_section(text_today, 'Action') or extract_section(text_today, 'Prochain'))
    ques = (extract_section(text_today, '问题') or extract_section(text_today, 'Question') 
            or extract_section(text_today, 'Question'))

    summary = text_today.strip().splitlines()
    if summary:
        summary = summary[:5]
        summary_text = ' '.join(l.strip() for l in summary)
    else:
        summary_text = ''

    parts = []
    if summary_text:
        parts.append("## 摘要\n" + summary_text.strip())
    if dec:
        parts.append("## 决策\n" + '\n'.join(f"- {i}" for i in dec))
    if les:
        parts.append("## 学习/要点\n" + '\n'.join(f"- {i}" for i in les))
    if act:
        parts.append("## 下一步\n" + '\n'.join(f"- {i}" for i in act))
    if ques:
        parts.append("## 问题\n" + '\n'.join(f"- {i}" for i in ques))

    if not parts:
        parts.append("## 自动摘要\n今日 memory 中没有找到结构化条目。")

    content = f"# 每日摘要 - {date_str}\n\n" + '\n\n'.join(parts)
    return date_str, content

def main():
    script_dir = os.path.dirname(os.path.realpath(__file__))
    base_dir = os.path.abspath(os.path.join(script_dir, '..', '..'))
    today = date.today()

    date_str, content = gather_digest(base_dir, today)
    out_dir = os.path.join(base_dir, 'journals', 'digest')
    if not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"digest-{date_str}.md")
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"已生成: {out_path}")

if __name__ == '__main__':
    main()
