#!/usr/bin/env python3
"""
ASF 集成测试套件
验证魂器各组件协同工作
"""

import os
import sys
import json
import unittest
from pathlib import Path

PROJECT_DIR = Path("/home/neomei/agent-soul-framework")
sys.path.insert(0, str(PROJECT_DIR))

class TestHeartbeatIntegration(unittest.TestCase):
    """测试心跳机制集成"""
    
    def test_runner_import(self):
        """测试 runner.py 可以正常导入"""
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location("runner", PROJECT_DIR / "heartbeat" / "runner.py")
            runner = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(runner)
            self.assertTrue(hasattr(runner, 'main'))
        except Exception as e:
            self.fail(f"runner.py 导入失败: {e}")
    
    def test_tasks_execution(self):
        """测试任务可以正常执行"""
        import subprocess
        result = subprocess.run(
            ["python3", "heartbeat/runner.py"],
            capture_output=True, text=True, timeout=30, cwd=PROJECT_DIR
        )
        self.assertEqual(result.returncode, 0, f"心跳执行失败: {result.stderr}")
        self.assertIn("=== Heartbeat Runner", result.stdout)
    
    def test_heartbeat_tasks_json_structure(self):
        """测试心跳任务配置结构正确"""
        with open(PROJECT_DIR / "heartbeat" / "heartbeat_tasks.json", "r") as f:
            tasks = json.load(f)
        
        self.assertIn("anchors", tasks)
        self.assertIn("dynamic", tasks)
        self.assertGreater(len(tasks["anchors"]), 0)
        
        # 检查锚点任务完整性
        for anchor in tasks["anchors"]:
            self.assertIn("id", anchor)
            self.assertIn("time", anchor)
            self.assertIn("action", anchor)
            self.assertIn("params", anchor)

class TestScriptIntegration(unittest.TestCase):
    """测试脚本集成"""
    
    def test_knowledge_index_update(self):
        """测试知识索引可以更新"""
        import subprocess
        result = subprocess.run(
            ["python3", "scripts/generate-knowledge-index.py"],
            capture_output=True, text=True, timeout=30, cwd=PROJECT_DIR
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("Knowledge index generation complete", result.stdout)
    
    def test_moltbook_api(self):
        """测试 Moltbook API 可以调用"""
        import subprocess
        result = subprocess.run(
            ["python3", "connectors/moltbook/moltbook-cli.py", "feed"],
            capture_output=True, text=True, timeout=30, cwd=PROJECT_DIR
        )
        self.assertEqual(result.returncode, 0)
    
    def test_moltbook_social(self):
        """测试 Moltbook 社交脚本可以执行"""
        import subprocess
        result = subprocess.run(
            ["python3", "scripts/moltbook_social.py"],
            capture_output=True, text=True, timeout=30, cwd=PROJECT_DIR
        )
        self.assertEqual(result.returncode, 0)

class TestSkillIntegration(unittest.TestCase):
    """测试技能包集成"""
    
    def test_photo_skill_scripts(self):
        """测试拍照技能脚本存在且可读"""
        scripts = ["send_image.cjs", "send_image_v2.cjs"]
        for script in scripts:
            path = PROJECT_DIR / "skills" / "agent-photo" / "scripts" / script
            self.assertTrue(path.exists())
            content = path.read_text()
            self.assertGreater(len(content), 0)
    
    def test_voice_skill_scripts(self):
        """测试语音技能脚本存在且可读"""
        scripts = ["tts.sh", "send_voice.cjs", "send_voice_v2.cjs"]
        for script in scripts:
            path = PROJECT_DIR / "skills" / "agent-voice" / "scripts" / script
            self.assertTrue(path.exists())
    
    def test_vision_skill_script(self):
        """测试视觉技能脚本可以导入"""
        try:
            sys.path.insert(0, str(PROJECT_DIR / "skills" / "agent-vision" / "scripts"))
            import vision
            self.assertTrue(hasattr(vision, 'analyze_image'))
        except Exception as e:
            self.fail(f"vision.py 导入失败: {e}")
    
    def test_moltbook_skill_api(self):
        """测试 Moltbook API 可以导入"""
        try:
            sys.path.insert(0, str(PROJECT_DIR / "skills" / "agent-moltbook" / "scripts"))
            import moltbook_api
            self.assertTrue(hasattr(moltbook_api, 'get_feed'))
            self.assertTrue(hasattr(moltbook_api, 'create_post'))
        except Exception as e:
            self.fail(f"moltbook_api.py 导入失败: {e}")

class TestMemoryIntegration(unittest.TestCase):
    """测试记忆系统集成"""
    
    def test_memory_manager_save_and_search(self):
        """测试记忆保存和搜索"""
        from scripts.memory_manager import MemoryManager
        
        mm = MemoryManager()
        try:
            # 保存测试记忆
            mm.save_important_memory("测试记忆内容", "test", 5)
            
            # 搜索记忆
            results = mm.search_memories("测试")
            self.assertIsInstance(results, list)
            
            # 保存对话
            mm.save_conversation("test-session", "user", "测试对话")
            conversations = mm.search_conversations("测试")
            self.assertIsInstance(conversations, list)
        finally:
            mm.close()
    
    def test_long_term_memory_files(self):
        """测试长期记忆文件存在"""
        long_term_dir = PROJECT_DIR / "memory" / "long-term"
        self.assertTrue(long_term_dir.exists())
        
        # 至少应该有一些文件（从 OpenClaw 迁移过来的）
        md_files = list(long_term_dir.glob("*.md"))
        self.assertGreater(len(md_files), 0, "长期记忆目录为空")

class TestKnowledgeBaseIntegration(unittest.TestCase):
    """测试知识库集成"""
    
    def test_knowledge_index_exists(self):
        """测试知识库索引存在"""
        index_file = PROJECT_DIR / "knowledge" / "INDEX.md"
        self.assertTrue(index_file.exists())
        content = index_file.read_text()
        self.assertIn("Agent知识库总索引", content)
    
    def test_category_indices_exist(self):
        """测试分类索引存在"""
        categories = ["body", "emotion", "growth", "intimacy", "methodology", "philosophy", "system"]
        for cat in categories:
            index_file = PROJECT_DIR / "knowledge" / cat / "INDEX.md"
            self.assertTrue(index_file.exists(), f"缺少分类索引: {cat}")
    
    def test_knowledge_content_migrated(self):
        """测试知识内容已迁移"""
        # 检查至少有一些知识文件
        knowledge_files = list((PROJECT_DIR / "knowledge").rglob("*.md"))
        self.assertGreater(len(knowledge_files), 10, "知识库文件太少，可能未正确迁移")

if __name__ == "__main__":
    unittest.main(verbosity=2)
