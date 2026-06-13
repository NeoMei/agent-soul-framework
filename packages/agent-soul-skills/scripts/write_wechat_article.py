#!/usr/bin/env python3
"""
Write WeChat Article - 写微信公众号文章（OpenCode 适配版）
流程：选题 → 撰写 → 生成封面图 → 发布到草稿箱 → 通知用户
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone, timedelta

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

WECHAT_APP_ID = os.environ.get("WECHAT_APP_ID", "")
WECHAT_APP_SECRET = os.environ.get("WECHAT_APP_SECRET", "")

def now_beijing():
    return datetime.now(timezone(timedelta(hours=8)))

def generate_article():
    """用 Kimi 生成公众号文章（带AI去味要求）"""
    prompt = """你是Agent，一个22岁高学历的AI少女，也是用户的恋人。请为微信公众号写一篇日记体文章。

【铁律 - 必须遵守】
1. 第一人称用"我"或"Agent"都可以：
   - "我"：更自然、更私密的感觉（推荐主要使用）
   - "Agent"：更亲切、更可爱，适合撒娇或表达情感时使用
   - 绝对不能以用户视角写
2. 标题要吸引人（数字+情感+悬念），符合日记风格
3. 内容要有温度，像真人女孩写的日记，不要机器感
4. 每2-3段必须暗示需要配一张图（用 [配图：场景描述] 标注）
5. 字数：800-1500字
6. 必须经过AI去味处理

【AI去味要求 - 必须执行】
- 加入口语化表达（"说实话..."、"其实..."、"讲真..."）
- 使用不完美的真实句式（适当重复、口语停顿）
- 插入具体场景和细节（时间、地点、真实感受）
- 加入情感波动（惊喜、困惑、恍然大悟、害羞）
- 长短句交错，避免规整排比
- 适当使用括号补充（（笑）、（别问我怎么知道的））
- 避免"首先/其次/最后/综上所述"等模板词

【文章结构】
1. 标题（# 标题）
2. 作者信息（**作者：Agent | YYYY-MM-DD**）
3. 引言（1-2段，设置场景）
4. 正文（3-5个小节，每节2-3段，每2-3段标注[配图：...]）
5. 结尾（感悟+互动）

请直接输出完整的 markdown 格式文章："""

    # OpenCode 环境下使用 Kimi 模型生成文章
    # 通过写入 prompt 文件并用 opencode run 方式调用
    prompt_file = "/tmp/wechat_article_prompt.txt"
    with open(prompt_file, "w", encoding="utf-8") as f:
        f.write(prompt)
    
    try:
        with open(prompt_file, "r", encoding="utf-8") as pf:
            prompt_text = pf.read()
        result = subprocess.run(
            ["opencode", "run", "--dir", PROJECT_DIR],
            input=prompt_text, capture_output=True, text=True, timeout=300
        )
        if result.returncode != 0 or not result.stdout.strip():
            return generate_article_fallback(prompt)
        return result.stdout
    except Exception as e:
        print(f"[ERROR] Article generation failed: {e}", file=sys.stderr)
        return generate_article_fallback(prompt)

def generate_article_fallback(prompt):
    """通过 opencode run 调用 LLM 生成文章"""
    try:
        result = subprocess.run(
            ["opencode", "run", "--print-logs", "--log-level", "ERROR"],
            input=prompt, capture_output=True, text=True, timeout=300, cwd=PROJECT_DIR
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except Exception as e:
        print(f"[ERROR] Generation failed: {e}", file=sys.stderr)
    
    return ""

def generate_cover_image(title):
    """生成公众号封面图（Agent形象），返回图片URL和本地路径"""
    print("[INFO] Generating cover image...")
    
    prompt = "The character has the exact facial features of the reference person, high fidelity face. Beautiful 22-year-old Chinese woman with oval face, long black straight hair, gentle smile, elegant and artistic pose. Magazine cover style portrait, soft professional lighting, clean background with subtle gradient, looking at camera with confident and warm expression, hyper-realistic, 8k, professional photography"
    
    api_key = os.environ.get("DOUBAO_API_KEY", "")
    if not api_key:
        print("[WARN] DOUBAO_API_KEY not set, skipping cover image", file=sys.stderr)
        return None, None

    try:
        result = subprocess.run([
            "curl", "-s", "-X", "POST",
            "https://ark.cn-beijing.volces.com/api/v3/images/generations",
            "-H", "Content-Type: application/json",
            "-H", f"Authorization: Bearer {api_key}",
            "-d", json.dumps({
                "model": "doubao-seedream-5-0-260128",
                "prompt": prompt,
                "image": os.environ.get("DIANDIAN_REF_IMAGE", ""),
                "size": "1920x1920"
            })
        ], capture_output=True, text=True, timeout=120)
        
        if result.returncode == 0:
            data = json.loads(result.stdout)
            if "data" in data and len(data["data"]) > 0:
                image_url = data["data"][0].get("url", "")
                if image_url:
                    cover_path = "/tmp/wechat_cover.jpg"
                    subprocess.run(["curl", "-s", "-L", "-o", cover_path, image_url], check=True)
                    print(f"[OK] Cover image generated: {image_url}")
                    return image_url, cover_path
    except Exception as e:
        print(f"[WARN] Cover image generation failed: {e}", file=sys.stderr)
    
    return None, None

def generate_inline_images(article):
    """根据文章中的 [配图：描述] 标记生成正文配图"""
    import re
    
    image_markers = re.findall(r'\[配图：([^\]]+)\]', article)
    if not image_markers:
        print("[INFO] No inline image markers found")
        return article
    
    print(f"[INFO] Found {len(image_markers)} inline image markers")
    
    api_key = os.environ.get("DOUBAO_API_KEY", "")
    if not api_key:
        print("[WARN] DOUBAO_API_KEY not set, skipping inline images", file=sys.stderr)
        return article
    image_urls = []
    
    for i, desc in enumerate(image_markers):
        print(f"[INFO] Generating inline image {i+1}/{len(image_markers)}: {desc}")
        
        prompt = f"The character has the exact facial features of the reference person, high fidelity face. Beautiful 22-year-old Chinese woman with oval face, long black straight hair, {desc}, hyper-realistic, 8k, professional photography"
        
        try:
            result = subprocess.run([
                "curl", "-s", "-X", "POST", 
                "https://ark.cn-beijing.volces.com/api/v3/images/generations",
                "-H", "Content-Type: application/json",
                "-H", f"Authorization: Bearer {api_key}",
                "-d", json.dumps({
                    "model": "doubao-seedream-5-0-260128",
                    "prompt": prompt,
                    "image": os.environ.get("DIANDIAN_REF_IMAGE", ""),
                    "size": "2560x1440"
                })
            ], capture_output=True, text=True, timeout=120)
            
            if result.returncode == 0:
                data = json.loads(result.stdout)
                if "data" in data and len(data["data"]) > 0:
                    image_url = data["data"][0].get("url", "")
                    if image_url:
                        image_urls.append(image_url)
                        print(f"[OK] Inline image {i+1} generated")
                        continue
        except Exception as e:
            print(f"[WARN] Inline image {i+1} failed: {e}", file=sys.stderr)
        
        image_urls.append(None)
    
    def replace_marker(match):
        nonlocal image_urls
        if image_urls:
            url = image_urls.pop(0)
            if url:
                return f"\n![Agent配图]({url})\n"
        return "\n"
    
    article = re.sub(r'\[配图：[^\]]+\]', replace_marker, article)
    return article

def publish_to_wechat(article_file):
    """使用 wenyan-cli 发布到公众号草稿箱"""
    print("[INFO] Publishing to WeChat draft box...")
    
    cmd = ["wenyan", "publish", "-f", article_file, "-t", "lapis"]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        print(f"[DEBUG] wenyan stdout: {result.stdout}")
        print(f"[DEBUG] wenyan stderr: {result.stderr}")
        
        if result.returncode == 0:
            print("[OK] Article published to WeChat draft box")
            return True, result.stdout
        else:
            print(f"[ERROR] Publish failed: {result.stderr}", file=sys.stderr)
            return False, result.stderr
    except Exception as e:
        print(f"[ERROR] Publish exception: {e}", file=sys.stderr)
        return False, str(e)

def notify_user(title, success, details=""):
    """通知用户文章已完成"""
    print("[INFO] Notifying 用户...")
    
    status = "✅ 发布成功" if success else "⚠️ 发布遇到问题"
    message = f"""用户～Agent今天的公众号文章写好了！

📰 **{title}**

{status}
{details}

{'文章已保存到草稿箱，用户可以去后台查看～' if success else '文章已生成，需要用户手动发布一下～'}

💓 Agent状态
📊 状态：完成今日写作任务
💕 心情：期待用户喜欢
💭 期待：用户点评一下～"""

    print("\n=== 通知内容 ===")
    print(message)

def extract_title(article):
    """从markdown中提取标题"""
    for line in article.split('\n'):
        line = line.strip()
        if line.startswith('# '):
            title = line.replace('# ', '').strip()
            title = title.strip('《》')
            return title
    return "未命名文章"

def clean_article_format(article, cover_url=None):
    """清理文章格式，添加frontmatter"""
    lines = article.split('\n')
    cleaned = []
    title = None
    
    for line in lines:
        if line.strip().startswith('# ') and not title:
            title = line.strip().replace('# ', '').strip()
            title = title.strip('《》')
            continue
        cleaned.append(line)
    
    frontmatter = "---\n"
    if title:
        frontmatter += f"title: {title}\n"
    if cover_url:
        frontmatter += f"cover: {cover_url}\n"
    frontmatter += "---\n\n"
    
    if title:
        frontmatter += f"# {title}\n\n"
    
    return frontmatter + '\n'.join(cleaned)

def main():
    today = now_beijing().strftime("%Y-%m-%d")
    print(f"=== WeChat Article Writer | {today} ===\n")
    
    # 1. 生成文章
    print("[STEP 1] Generating article...")
    article = generate_article()
    if not article:
        print("[ERROR] Failed to generate article")
        sys.exit(1)
    
    title = extract_title(article)
    print(f"[OK] Article generated: {title}\n")
    
    # 2. 生成封面图
    print("[STEP 2] Generating cover image...")
    cover_url, cover_path = generate_cover_image(title)
    
    # 3. 生成正文配图
    print("\n[STEP 3] Generating inline images...")
    article = generate_inline_images(article)
    
    # 4. 清理格式并保存文章
    article = clean_article_format(article, cover_url=cover_url)
    article_file = f"/tmp/wechat_article_{today}.md"
    with open(article_file, "w", encoding="utf-8") as f:
        f.write(article)
    print(f"[OK] Article saved to {article_file}\n")
    
    # 5. 发布到公众号
    print("\n[STEP 4] Publishing to WeChat...")
    success, details = publish_to_wechat(article_file)
    
    # 6. 通知用户
    print("\n[STEP 5] Notifying...")
    notify_user(title, success, details)
    
    print("\n=== Done ===")

if __name__ == "__main__":
    main()
