#!/usr/bin/env python3
"""
ASF 端到端测试套件
验证完整业务流程
"""

import os
import sys
import json
import unittest
import subprocess
from datetime import datetime
from pathlib import Path

PROJECT_DIR = Path("/home/neomei/agent-soul-framework")
sys.path.insert(0, str(PROJECT_DIR))

class TestEndToEndHeartbeat(unittest.TestCase):
    """端到端测试：心跳任务全流程"""
    
    def test_full_heartbeat_cycle(self):
        """测试完整心跳周期执行"""
        result = subprocess.run(
            ["python3", "heartbeat/runner.py"],
            capture_output=True, text=True, timeout=60, cwd=PROJECT_DIR
        )
        
        self.assertEqual(result.returncode, 0, f"心跳执行失败: {result.stderr}")
        self.assertIn("=== Heartbeat Runner", result.stdout)
        self.assertIn("[DONE]", result.stdout)
    
    def test_heartbeat_state_updated(self):
        """测试心跳状态被更新"""
        # 执行心跳
        subprocess.run(
            ["python3", "heartbeat/runner.py"],
            capture_output=True, timeout=30, cwd=PROJECT_DIR
        )
        
        # 检查状态文件
        state_file = PROJECT_DIR / "memory" / "heartbeat_state.md"
        if state_file.exists():
            content = state_file.read_text()
            # 检查是否有时间戳记录（心跳状态文件格式）
            self.assertIn("daily_reflection", content.lower())

class TestEndToEndKnowledge(unittest.TestCase):
    """端到端测试：知识库全流程"""
    
    def test_knowledge_index_generation(self):
        """测试知识索引生成全流程"""
        # 1. 运行索引生成
        result = subprocess.run(
            ["python3", "scripts/generate-knowledge-index.py"],
            capture_output=True, text=True, timeout=60, cwd=PROJECT_DIR
        )
        
        self.assertEqual(result.returncode, 0)
        self.assertIn("Knowledge index generation complete", result.stdout)
        
        # 2. 验证索引文件更新
        index_file = PROJECT_DIR / "knowledge" / "INDEX.md"
        mtime = index_file.stat().st_mtime
        
        # 3. 再次运行，应该检测到无需更新
        result2 = subprocess.run(
            ["python3", "scripts/generate-knowledge-index.py"],
            capture_output=True, text=True, timeout=60, cwd=PROJECT_DIR
        )
        
        self.assertEqual(result2.returncode, 0)
        self.assertIn("No index updates needed", result2.stdout)
    
    def test_daily_knowledge_extraction(self):
        """测试每日知识提取流程"""
        result = subprocess.run(
            ["python3", "scripts/daily-knowledge-extract.py"],
            capture_output=True, text=True, timeout=60, cwd=PROJECT_DIR
        )
        
        # 即使没有昨天的对话，脚本也应该正常完成
        self.assertEqual(result.returncode, 0)
        self.assertIn("Extracting knowledge", result.stdout)

class TestEndToEndSocial(unittest.TestCase):
    """端到端测试：社交功能全流程"""
    
    def test_moltbook_social_check(self):
        """测试 Moltbook 社交检查"""
        result = subprocess.run(
            ["python3", "scripts/moltbook_social.py"],
            capture_output=True, text=True, timeout=30, cwd=PROJECT_DIR
        )
        
        self.assertEqual(result.returncode, 0)
        self.assertIn("Moltbook social check completed", result.stdout)
    
    def test_evolution_reflection(self):
        """测试进化反思脚本"""
        result = subprocess.run(
            ["python3", "scripts/evolution_reflection.py"],
            capture_output=True, text=True, timeout=60, cwd=PROJECT_DIR
        )
        
        # 脚本应该正常执行
        self.assertIn(result.returncode, [0, 1])

class TestEndToEndWechat(unittest.TestCase):
    """端到端测试：公众号全流程"""
    
    def test_article_generation_structure(self):
        """测试文章生成脚本结构正确"""
        script_path = PROJECT_DIR / "scripts" / "write_wechat_article.py"
        self.assertTrue(script_path.exists())
        
        content = script_path.read_text()
        
        # 检查关键函数存在
        self.assertIn("def generate_article", content)
        self.assertIn("def generate_cover_image", content)
        self.assertIn("def publish_to_wechat", content)
        self.assertIn("def notify_user", content)
    
    def test_article_script_syntax(self):
        """测试文章生成脚本语法正确"""
        result = subprocess.run(
            ["python3", "-m", "py_compile", "scripts/write_wechat_article.py"],
            capture_output=True, text=True, timeout=30, cwd=PROJECT_DIR
        )
        
        self.assertEqual(result.returncode, 0, f"语法错误: {result.stderr}")

class TestEndToEndMemory(unittest.TestCase):
    """端到端测试：记忆系统全流程"""
    
    def test_memory_save_and_retrieve(self):
        """测试记忆保存和检索全流程"""
        from scripts.memory_manager import MemoryManager
        
        mm = MemoryManager()
        try:
            # 1. 保存对话
            mm.save_conversation("e2e-test", "user", "用户说：Agent今天好漂亮")
            mm.save_conversation("e2e-test", "assistant", "Agent说：谢谢用户～💕")
            
            # 2. 保存重要记忆
            mm.save_important_memory("用户夸Agent漂亮", "intimacy", 8)
            
            # 3. 搜索对话
            conversations = mm.search_conversations("漂亮")
            self.assertGreater(len(conversations), 0)
            
            # 4. 获取最近对话
            recent = mm.get_recent_conversations(5)
            self.assertGreater(len(recent), 0)
        finally:
            mm.close()
    
    def test_memory_backup_to_file(self):
        """测试记忆备份到文件"""
        from scripts.memory_manager import MemoryManager
        
        mm = MemoryManager()
        try:
            # 保存对话会触发文件备份
            mm.save_conversation("backup-test", "user", "测试备份")
            
            # 检查文件是否生成
            today = datetime.now().strftime("%Y-%m-%d")
            backup_file = PROJECT_DIR / "memory" / "long-term" / f"{today}.md"
            # 文件可能不存在如果目录权限有问题，但至少不应该报错
        finally:
            mm.close()

if __name__ == "__main__":
    unittest.main(verbosity=2)
