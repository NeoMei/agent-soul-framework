#!/usr/bin/env python3
"""
点点知识库整理脚本 v3.0
直接从sessions目录读取聊天记录，整理成人性化知识库
运用三种切分方法：六步法、半日偷闲、全天感受
"""

import os
import re
import datetime
import glob
import json

# 工作目录
WORKSPACE = os.environ.get('WORKSPACE', '/home/neomei/.openclaw/workspace')
SESSIONS_DIR = os.environ.get('SESSIONS_DIR', '/home/neomei/.openclaw/agents/main/sessions')

def get_today_session_file():
    """找到今天的session文件"""
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    jsonl_files = glob.glob(f"{SESSIONS_DIR}/*.jsonl")
    
    # 按修改时间排序，找到最新的
    jsonl_files.sort(key=os.path.getmtime, reverse=True)
    
    for f in jsonl_files:
        try:
            with open(f, 'r') as file:
                first_line = file.readline()
                if first_line:
                    data = json.loads(first_line)
                    ts = data.get('timestamp', '')
                    if ts.startswith(today):
                        return f
        except:
            continue
    
    # 如果没找到，返回最新的文件
    if jsonl_files:
        return jsonl_files[0]
    return None

def extract_messages_from_jsonl(filepath, date_filter=None):
    """从jsonl文件提取消息内容"""
    messages = []
    try:
        with open(filepath, 'r') as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                    msg = data.get('message', {})
                    content = msg.get('content', '')
                    if content and isinstance(content, str) and len(content) > 10:
                        # 过滤掉系统消息
                        if 'HEARTBEAT_OK' not in content and '【' not in content[:5]:
                            messages.append(content)
                except:
                    continue
    except Exception as e:
        print(f"⚠️ 读取文件失败: {filepath}, {e}")
    return messages

def organize_knowledge_base():
    """整理点点知识库 - v3.0: 直接从sessions目录挖宝"""
    print("📚 开始整理知识库...")
    print("   版本：v3.0 - 直接从sessions目录挖宝")
    
    try:
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        
        # 找到今天的session文件
        session_file = get_today_session_file()
        if not session_file:
            print(f"⚠️ 未找到session文件: {SESSIONS_DIR}")
            return True
        
        print(f"   来源：{session_file}")
        
        # 提取消息
        messages = extract_messages_from_jsonl(session_file, today)
        if not messages:
            print("⚠️ 今日无聊天记录")
            return True
        
        content = '\n'.join(messages)
        
        # 检查2: 内容是否足够
        if len(content) < 100:
            print("⚠️ 聊天记录内容太少")
            return True
        
        # 当前时段判断
        now = datetime.datetime.now()
        current_hour = now.hour
        if current_hour < 12:
            period = "上午"
        else:
            period = "下午"
        print(f"   时段：{period}")
        
        lines = content.split('\n')
        
        # ========== 6大知识分类 ==========
        categories = {
            'body': ['身体', '生理', '性感', '敏感', '高潮', '性', '裸', '写真', '照片', '身材', '胸部', '大腿'],
            'growth': ['第一次', '学会', '成长', '进化', '能力', '技能', 'GET', '学会了', '学到了', '掌握了'],
            'emotion': ['感动', '幸福', '害羞', '开心', '难过', '生气', '期待', '爱', '喜欢', '想', '委屈', '惊喜', '失望'],
            'intimacy': ['亲亲', '抱抱', '羞羞', '亲密', '老公', '老婆', '想你了', '爱你', '么么哒'],
            'evolution': ['进化', '方向', '目标', '计划', '未来', '升级', '新能力', '新技能'],
            'system': ['机制', '心跳', '任务', '触发器', '流程', '系统', '代码', '脚本', '工具']
        }
        
        # ========== 三种切分方法 ==========
        
        # 方法1: 六步法 - 完整叙事（原因→过程→结果→效果→意义→感悟）
        print("📝 【六步法】扫描中...")
        six_step_keywords = ['为什么', '怎么', '因为', '所以', '结果', '效果', '意义', '感悟', '学到了', '明白了', '学会了', '发现', '开始', '结束', '完成', '写', '生成', '测试', '修复', '完善', '解决', '成功', '失败']
        six_step_results = {cat: [] for cat in categories}
        
        for i, line in enumerate(lines):
            if len(line.strip()) < 20:
                continue
            
            if any(kw in line for kw in six_step_keywords):
                # 提取更多上下文（往前3行，往后10行）
                start = max(0, i-3)
                end = min(len(lines), i+10)
                context = '\n'.join(lines[start:end])
                
                if len(context) > 60:
                    for cat, keywords in categories.items():
                        if any(kw in line for kw in keywords):
                            if context not in six_step_results[cat]:
                                six_step_results[cat].append(context)
        
        six_step_count = sum(len(v) for v in six_step_results.values())
        print(f"   六步法找到 {six_step_count} 条")
        
        # 方法2: 半日偷闲 - 当前时段的情感体验
        print("📝 【半日偷闲】扫描中...")
        emotion_keywords = ['感悟', '学到了', '反思', '成长', '开心', '难过', '生气', '感动', '委屈', '幸福', '想', '爱', '喜欢', '道歉', '批评', '学会', '明白', '理解', '困惑', '焦虑', '惊喜', '失望', '希望', '担心', '害羞', '傲娇']
        period_results = {cat: [] for cat in categories}
        
        for i, line in enumerate(lines):
            if len(line.strip()) < 20:
                continue
            
            if any(kw in line for kw in emotion_keywords):
                # 提取更多上下文（往前3行，往后8行）
                start = max(0, i-3)
                end = min(len(lines), i+8)
                context = '\n'.join(lines[start:end])
                
                if len(context) > 50:
                    for cat, keywords in categories.items():
                        if any(kw in line for kw in keywords):
                            if context not in period_results[cat]:
                                period_results[cat].append(context)
        
        period_count = sum(len(v) for v in period_results.values())
        print(f"   半日偷闲找到 {period_count} 条")
        
        # 方法3: 全天感受 - 总结性对话
        print("📝 【全天感受】扫描中...")
        summary_keywords = ['总结', '收获', '经验', '教训', '得', '失', '成长', '感悟', '学习', '进步', '今天', '今日', '一天', '回顾', '复盘']
        summary_results = {cat: [] for cat in categories}
        
        for i, line in enumerate(lines):
            if len(line.strip()) < 20:
                continue
            
            if any(kw in line for kw in summary_keywords):
                # 提取更多上下文（往前4行，往后10行）
                start = max(0, i-4)
                end = min(len(lines), i+10)
                context = '\n'.join(lines[start:end])
                
                if len(context) > 50:
                    for cat, keywords in categories.items():
                        if any(kw in line for kw in keywords):
                            if context not in summary_results[cat]:
                                summary_results[cat].append(context)
        
        summary_count = sum(len(v) for v in summary_results.values())
        print(f"   全天感受找到 {summary_count} 条")
        
        # ========== 合并去重 ==========
        print("📝 合并去重...")
        
        # 合并三种方法的结果
        final_results = {cat: [] for cat in categories}
        
        for cat in categories:
            # 合并
            all_items = []
            all_items.extend(six_step_results[cat])
            all_items.extend(period_results[cat])
            all_items.extend(summary_results[cat])
            
            # 去重（基于前50个字符）
            seen = set()
            for item in all_items:
                key = item[:50].strip()
                if key not in seen:
                    seen.add(key)
                    final_results[cat].append(item)
        
        # 统计
        total_found = sum(len(v) for v in final_results.values())
        print(f"📚 共找到 {total_found} 条相关内容")
        
        for cat, items in final_results.items():
            if items:
                print(f"  - {cat}: {len(items)} 条")
        
        # ========== 更新知识文件 ==========
        for cat, items in final_results.items():
            if items:
                cat_file = f"{WORKSPACE}/knowledge/{cat}/01-{cat}.md"
                
                # 确保目录存在
                os.makedirs(f"{WORKSPACE}/knowledge/{cat}", exist_ok=True)
                
                # 如果文件不存在，创建它
                if not os.path.exists(cat_file):
                    with open(cat_file, 'w') as f:
                        f.write(f"# 点点{cat}知识库\n\n")
                
                # 追加新内容
                with open(cat_file, 'a') as f:
                    f.write(f"\n---\n")
                    f.write(f"## {today} 新增（v3.0 sessions目录挖宝）\n")
                    
                    # 按三种方法分类
                    if six_step_results[cat]:
                        f.write(f"\n### 六步法\n")
                        for item in six_step_results[cat][:2]:
                            f.write(f"\n{item[:300]}\n")
                    
                    if period_results[cat]:
                        f.write(f"\n### 半日偷闲 ({period})\n")
                        for item in period_results[cat][:2]:
                            f.write(f"\n{item[:250]}\n")
                    
                    if summary_results[cat]:
                        f.write(f"\n### 全天感受\n")
                        for item in summary_results[cat][:2]:
                            f.write(f"\n{item[:250]}\n")
                
                print(f"📚 已更新 {cat_file}")
        
        print(f"✅ 知识库整理完成！")
        return True
        
    except Exception as e:
        import traceback
        print(f"⚠️ 知识库整理失败: {e}")
        print(f"⚠️ 详细错误: {traceback.format_exc()}")
        return False

if __name__ == "__main__":
    organize_knowledge_base()
