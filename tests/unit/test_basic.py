#!/usr/bin/env python3
"""
ASF 基础功能测试套件
验证魂器核心组件是否正常工作
"""

import os
import sys
import unittest
from pathlib import Path

PROJECT_DIR = Path("/home/neomei/agent-soul-framework")
sys.path.insert(0, str(PROJECT_DIR))

class TestProjectStructure(unittest.TestCase):
    """测试项目结构完整性"""
    
    def test_directories_exist(self):
        required_dirs = [
            "soul", "skills", "memory", "knowledge", 
            "heartbeat", "connectors", "scripts", "tests", "docs"
        ]
        for dir_name in required_dirs:
            self.assertTrue((PROJECT_DIR / dir_name).exists(), f"缺少目录: {dir_name}")
    
    def test_soul_files_exist(self):
        required_files = ["SOUL.md", "IDENTITY.md", "USER.md", "COVENANT.md", "AGENTS.md", "HEARTBEAT.md"]
        for file_name in required_files:
            self.assertTrue((PROJECT_DIR / "soul" / file_name).exists(), f"缺少灵魂文件: {file_name}")
    
    def test_opencode_config(self):
        self.assertTrue((PROJECT_DIR / ".opencode" / "config.json").exists())
        self.assertTrue((PROJECT_DIR / ".opencode" / "prompt.md").exists())
    
    def test_env_file(self):
        self.assertTrue((PROJECT_DIR / ".env").exists())

class TestScripts(unittest.TestCase):
    """测试脚本文件"""
    
    def test_scripts_exist(self):
        required_scripts = [
            "write_wechat_article.py",
            "daily-knowledge-extract.py", 
            "weekly-knowledge-sync.py",
            "evolution_reflection.py",
            "generate-knowledge-index.py",
            "moltbook_social.py",
            "memory_manager.py"
        ]
        for script in required_scripts:
            self.assertTrue((PROJECT_DIR / "scripts" / script).exists(), f"缺少脚本: {script}")
    
    def test_scripts_executable(self):
        scripts_dir = PROJECT_DIR / "scripts"
        for script in scripts_dir.glob("*.py"):
            self.assertTrue(os.access(script, os.X_OK), f"脚本不可执行: {script.name}")

class TestSkills(unittest.TestCase):
    """测试技能包"""
    
    def test_skills_exist(self):
        required_skills = [
            "agent-photo", "agent-voice", "agent-vision",
            "agent-hearing", "agent-moltbook", "wechat-mp-assistant"
        ]
        for skill in required_skills:
            skill_dir = PROJECT_DIR / "skills" / skill
            self.assertTrue(skill_dir.exists(), f"缺少技能包: {skill}")
            self.assertTrue((skill_dir / "SKILL.md").exists(), f"缺少 SKILL.md: {skill}")
    
    def test_skill_scripts_exist(self):
        skill_scripts = {
            "agent-photo": ["send_image.cjs", "send_image_v2.cjs"],
            "agent-voice": ["tts.sh", "send_voice.cjs", "send_voice_v2.cjs"],
            "agent-vision": ["vision.py"],
            "agent-hearing": ["hear.py"],
            "agent-moltbook": ["moltbook_api.py", "moltbook_social.py"],
        }
        for skill, scripts in skill_scripts.items():
            for script in scripts:
                self.assertTrue(
                    (PROJECT_DIR / "skills" / skill / "scripts" / script).exists(),
                    f"缺少脚本: {skill}/{script}"
                )

class TestConnectors(unittest.TestCase):
    """测试连接器"""
    
    def test_connectors_exist(self):
        required_connectors = ["moltbook"]
        for conn in required_connectors:
            conn_dir = PROJECT_DIR / "connectors" / conn
            self.assertTrue(conn_dir.exists(), f"缺少连接器: {conn}")
            self.assertTrue(any(conn_dir.iterdir()), f"连接器目录为空: {conn}")

class TestHeartbeat(unittest.TestCase):
    """测试心跳机制"""
    
    def test_heartbeat_files(self):
        self.assertTrue((PROJECT_DIR / "heartbeat" / "runner.py").exists())
        self.assertTrue((PROJECT_DIR / "heartbeat" / "tasks.json").exists())
        self.assertTrue((PROJECT_DIR / "heartbeat" / "heartbeat_tasks.json").exists())
    
    def test_tasks_json_valid(self):
        import json
        with open(PROJECT_DIR / "heartbeat" / "tasks.json", "r") as f:
            tasks = json.load(f)
        self.assertIn("tasks", tasks)
        self.assertGreater(len(tasks["tasks"]), 0)
    
    def test_heartbeat_tasks_json_valid(self):
        import json
        with open(PROJECT_DIR / "heartbeat" / "heartbeat_tasks.json", "r") as f:
            tasks = json.load(f)
        self.assertIn("anchors", tasks)
        self.assertIn("dynamic", tasks)

class TestKnowledgeBase(unittest.TestCase):
    """测试知识库"""
    
    def test_knowledge_structure(self):
        knowledge_dir = PROJECT_DIR / "knowledge"
        self.assertTrue((knowledge_dir / "INDEX.md").exists())
        
        categories = ["body", "emotion", "evolution", "growth", "intimacy", "methodology", "philosophy", "system"]
        for cat in categories:
            self.assertTrue((knowledge_dir / cat).exists(), f"缺少知识分类: {cat}")
    
    def test_memory_structure(self):
        memory_dir = PROJECT_DIR / "memory"
        self.assertTrue((memory_dir / "long-term").exists())
        self.assertTrue((memory_dir / "short-term").exists())
        self.assertTrue((memory_dir / "vector").exists())

class TestMemoryManager(unittest.TestCase):
    """测试记忆管理器"""
    
    def test_memory_manager_init(self):
        try:
            from scripts.memory_manager import MemoryManager
            mm = MemoryManager()
            mm.close()
        except Exception as e:
            self.fail(f"MemoryManager 初始化失败: {e}")
    
    def test_sqlite_connection(self):
        from scripts.memory_manager import MemoryManager
        mm = MemoryManager()
        try:
            mm.save_conversation("test-session", "user", "测试消息")
            results = mm.search_conversations("测试")
            self.assertGreater(len(results), 0)
        finally:
            mm.close()

if __name__ == "__main__":
    unittest.main(verbosity=2)
