#!/usr/bin/env python3
"""
Memory Manager - 魂器记忆管理系统
支持：SQLite + ChromaDB向量存储 + 阿里云百炼Embedding模型
"""

import os
import sys
import sqlite3
import json
import requests
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path

# 添加虚拟环境路径（自动检测 Python 版本）
venv_path = Path(__file__).parent.parent / ".venv"
if venv_path.exists():
    for py_ver in ["python3.12", "python3.11", "python3.13", "python3.10"]:
        site_pkgs = venv_path / "lib" / py_ver / "site-packages"
        if site_pkgs.exists():
            sys.path.insert(0, str(site_pkgs))
            break

try:
    import chromadb
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False
    print("[WARN] ChromaDB not available")

PROJECT_DIR = Path(__file__).parent.parent
MEMORY_DIR = PROJECT_DIR / "memory"
SHORT_TERM_DIR = MEMORY_DIR / "short-term"
LONG_TERM_DIR = MEMORY_DIR / "long-term"
VECTOR_DIR = MEMORY_DIR / "vector"

# 阿里云百炼Embedding配置
# 请设置环境变量 DASHSCOPE_API_KEY 或在 .env 文件中配置
# 示例: export DASHSCOPE_API_KEY="sk-ed02xxxxxxxx"
ALIYUN_API_KEY = os.environ.get("DASHSCOPE_API_KEY", "")
ALIYUN_EMBEDDING_URL = "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding"
ALIYUN_VECTOR_DIM = 1536

class AliyunEmbeddingClient:
    """阿里云百炼Embedding客户端"""
    
    def __init__(self, api_key=None):
        self.api_key = api_key or ALIYUN_API_KEY
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    def get_embedding(self, text):
        """获取文本的向量表示"""
        if not self.api_key:
            print("[WARN] Aliyun API Key not set")
            return None
        
        try:
            payload = {
                "model": "text-embedding-v2",
                "input": {
                    "texts": [text]
                }
            }
            
            response = requests.post(
                ALIYUN_EMBEDDING_URL,
                headers=self.headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                embeddings = data.get("output", {}).get("embeddings", [])
                if embeddings:
                    return embeddings[0].get("embedding", [])
            else:
                print(f"[WARN] Aliyun API error: {response.status_code} - {response.text}")
                return None
            
        except Exception as e:
            print(f"[WARN] Failed to get embedding: {e}")
            return None

class MemoryManager:
    def __init__(self):
        self.init_dirs()
        self.init_sqlite()
        self.embedding_client = AliyunEmbeddingClient()
        
        if CHROMADB_AVAILABLE:
            self.init_chromadb()
        else:
            self.chroma_client = None
            self.collection = None
    
    def init_dirs(self):
        """初始化目录结构"""
        SHORT_TERM_DIR.mkdir(parents=True, exist_ok=True)
        LONG_TERM_DIR.mkdir(parents=True, exist_ok=True)
        VECTOR_DIR.mkdir(parents=True, exist_ok=True)
    
    def init_sqlite(self):
        """初始化 SQLite 数据库"""
        self.db_path = SHORT_TERM_DIR / "conversations.db"
        self.conn = sqlite3.connect(str(self.db_path))
        self.cursor = self.conn.cursor()
        
        # 创建对话历史表
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                role TEXT,
                content TEXT,
                timestamp REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # 创建重要记忆表
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS important_memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT,
                content TEXT,
                importance INTEGER DEFAULT 5,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 创建同步元数据表（用于增量同步）
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS sync_metadata (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        self.conn.commit()
    
    def init_chromadb(self):
        """初始化 ChromaDB 向量数据库"""
        try:
            self.chroma_client = chromadb.PersistentClient(path=str(VECTOR_DIR))
            
            self.memories_col = self.chroma_client.get_or_create_collection(
                name="memories",
                metadata={"description": "魂器重要记忆向量存储"}
            )
            self.knowledge_col = self.chroma_client.get_or_create_collection(
                name="knowledge",
                metadata={"description": "知识卡片向量存储"}
            )
            self.summaries_col = self.chroma_client.get_or_create_collection(
                name="summaries",
                metadata={"description": "对话摘要向量存储"}
            )
            
            self.collection = self.memories_col
            
            print("[OK] ChromaDB initialized")
        except Exception as e:
            print(f"[WARN] ChromaDB initialization failed: {e}")
            self.chroma_client = None
            self.collection = None
            self.knowledge_col = None
            self.summaries_col = None
    
    def _add_to_collection(self, collection, doc_id, content, metadata):
        if not CHROMADB_AVAILABLE or collection is None:
            return False
        try:
            embedding = self.embedding_client.get_embedding(content)
            if embedding:
                collection.add(
                    ids=[doc_id],
                    embeddings=[embedding],
                    documents=[content],
                    metadatas=[metadata]
                )
                return True
            return False
        except Exception as e:
            print(f"[WARN] ChromaDB write failed: {e}")
            return False
    
    def save_conversation(self, session_id, role, content):
        """保存对话记录"""
        timestamp = datetime.now(timezone(timedelta(hours=8))).timestamp()
        
        self.cursor.execute('''
            INSERT INTO conversations (session_id, role, content, timestamp)
            VALUES (?, ?, ?, ?)
        ''', (session_id, role, content, timestamp))
        
        self.conn.commit()
        
        # 同时保存到文件系统
        self._save_to_file(session_id, role, content, timestamp)
    
    def _save_to_file(self, session_id, role, content, timestamp):
        """保存到文件系统备份"""
        date_str = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
        file_path = LONG_TERM_DIR / f"{date_str}.md"
        
        with open(file_path, "a", encoding="utf-8") as f:
            time_str = datetime.fromtimestamp(timestamp, timezone(timedelta(hours=8))).strftime("%H:%M:%S")
            f.write(f"\n## {time_str} | {role}\n\n{content}\n\n---\n")
    
    def save_important_memory(self, content, category="general", importance=5):
        """保存重要记忆"""
        # 保存到 SQLite
        self.cursor.execute('''
            INSERT INTO important_memories (category, content, importance)
            VALUES (?, ?, ?)
        ''', (category, content, importance))
        
        self.conn.commit()
        memory_id = self.cursor.lastrowid
        
        self._add_to_collection(
            self.memories_col, f"mem_{memory_id}", content,
            {"type": "memory", "category": category, "importance": importance,
             "timestamp": datetime.now(timezone(timedelta(hours=8))).isoformat()}
        )
        
        # 保存到文件系统
        self._save_memory_to_file(content, category, importance)
        
        return memory_id
    
    def save_knowledge_card(self, card_id, content, category, source_file="", date_str=""):
        ts = datetime.now(timezone(timedelta(hours=8))).isoformat()
        ok = self._add_to_collection(
            self.knowledge_col, f"kg_{card_id}", content,
            {"type": "knowledge", "category": category, "source_file": source_file,
             "date": date_str, "timestamp": ts}
        )
        if ok:
            print(f"[OK] 知识卡片 {card_id} 已写入向量库")
        return ok

    def save_session_summary(self, session_id, summary, date_str=""):
        ts = datetime.now(timezone(timedelta(hours=8))).isoformat()
        ok = self._add_to_collection(
            self.summaries_col, f"sum_{session_id}", summary,
            {"type": "summary", "session_id": session_id, "date": date_str, "timestamp": ts}
        )
        if ok:
            print(f"[OK] 摘要 {session_id[:16]}... 已写入向量库")
        return ok

    def get_vectorized_ids(self, collection_name):
        if not CHROMADB_AVAILABLE or self.chroma_client is None:
            return set()
        try:
            col = self.chroma_client.get_or_create_collection(name=collection_name)
            if col.count() == 0:
                return set()
            all_ids = col.get(include=[])["ids"]
            return set(all_ids)
        except Exception:
            return set()

    def vector_search(self, query, collections=None, limit=5):
        if not CHROMADB_AVAILABLE or self.chroma_client is None:
            return []
        if collections is None:
            collections = ["memories", "knowledge", "summaries"]
        
        query_embedding = self.embedding_client.get_embedding(query)
        if not query_embedding:
            return []
        
        results = []
        for col_name in collections:
            try:
                col = self.chroma_client.get_or_create_collection(name=col_name)
                if col.count() == 0:
                    continue
                qr = col.query(query_embeddings=[query_embedding], n_results=limit)
                docs = qr.get("documents", [[]])[0]
                metas = qr.get("metadatas", [[]])[0]
                dists = qr.get("distances", [[]])[0]
                for doc, meta, dist in zip(docs, metas, dists):
                    results.append({
                        "content": doc, "metadata": meta,
                        "distance": dist, "collection": col_name
                    })
            except Exception:
                continue
        
        results.sort(key=lambda x: x["distance"])
        return results[:limit]
    
    def _save_memory_to_file(self, content, category, importance):
        """保存记忆到文件系统"""
        file_path = LONG_TERM_DIR / "memories.md"
        
        with open(file_path, "a", encoding="utf-8") as f:
            timestamp = datetime.now(timezone(timedelta(hours=8))).isoformat()
            f.write(f"\n## [{category}] {timestamp} (重要性: {importance})\n\n{content}\n\n---\n")
    
    def search_conversations(self, query, limit=10):
        """搜索对话历史"""
        self.cursor.execute('''
            SELECT * FROM conversations
            WHERE content LIKE ?
            ORDER BY timestamp DESC
            LIMIT ?
        ''', (f'%{query}%', limit))
        
        return self.cursor.fetchall()
    
    def search_memories(self, query, category=None, limit=5):
        """语义搜索记忆"""
        if CHROMADB_AVAILABLE and self.collection is not None:
            try:
                query_embedding = self.embedding_client.get_embedding(query)
                
                if query_embedding:
                    where_filter = {"category": category} if category else None
                    results = self.collection.query(
                        query_embeddings=[query_embedding],
                        n_results=limit,
                        where=where_filter
                    )
                    
                    documents = results.get('documents', [[]])[0]
                    return documents if documents else []
            except Exception as e:
                print(f"[WARN] ChromaDB search failed: {e}")
        
        # 回退到 SQLite 搜索
        if category:
            self.cursor.execute('''
                SELECT content FROM important_memories
                WHERE category = ? AND content LIKE ?
                ORDER BY importance DESC, created_at DESC
                LIMIT ?
            ''', (category, f'%{query}%', limit))
        else:
            self.cursor.execute('''
                SELECT content FROM important_memories
                WHERE content LIKE ?
                ORDER BY importance DESC, created_at DESC
                LIMIT ?
            ''', (f'%{query}%', limit))
        
        return [row[0] for row in self.cursor.fetchall()]
    
    def get_recent_conversations(self, limit=10):
        """获取最近对话"""
        self.cursor.execute('''
            SELECT * FROM conversations
            ORDER BY timestamp DESC
            LIMIT ?
        ''', (limit,))
        
        return self.cursor.fetchall()
    
    def _get_sync_time(self, key="opencode_last_sync"):
        """获取上次同步时间"""
        row = self.cursor.execute(
            "SELECT value FROM sync_metadata WHERE key = ?", (key,)
        ).fetchone()
        if row and row[0]:
            try:
                return float(row[0])
            except (ValueError, TypeError):
                return None
        return None

    def _set_sync_time(self, key="opencode_last_sync", timestamp=None):
        """设置同步时间"""
        if timestamp is None:
            timestamp = datetime.now(timezone(timedelta(hours=8))).timestamp()
        self.cursor.execute(
            """INSERT INTO sync_metadata (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP""",
            (key, str(timestamp))
        )
        self.conn.commit()

    def sync_from_opencode(self, incremental=True):
        """从 OpenCode 自身的数据库同步对话到魂器记忆库（支持增量同步）"""
        import time
        opencode_db = os.path.expanduser("~/.local/share/opencode/opencode.db")
        if not os.path.exists(opencode_db):
            print("[FAIL] OpenCode 数据库不存在")
            return 0

        import sqlite3 as sql
        src = sql.connect(opencode_db)
        count = 0
        sync_start = time.time()

        try:
            # 获取上次同步时间（用于增量同步）
            last_sync = None
            if incremental:
                last_sync = self._get_sync_time("opencode_last_sync")
                if last_sync:
                    print(f"[INFO] 增量同步：从 {datetime.fromtimestamp(last_sync).strftime('%Y-%m-%d %H:%M:%S')} 开始")

            # 构建查询条件
            if last_sync:
                # 只同步更新的 session 和消息
                sessions = src.execute(
                    """SELECT id, title FROM session
                       WHERE time_updated > ?
                       ORDER BY time_updated DESC""",
                    (last_sync,)
                ).fetchall()
            else:
                # 首次全量同步，限制50个session
                sessions = src.execute(
                    "SELECT id, title FROM session ORDER BY time_updated DESC LIMIT 50"
                ).fetchall()

            for sess_id, title in sessions:
                # 获取该 session 的消息
                if last_sync:
                    messages = src.execute("""
                        SELECT m.data, GROUP_CONCAT(p.data, '|||') as parts_data
                        FROM message m
                        LEFT JOIN part p ON p.message_id = m.id
                        WHERE m.session_id = ? AND m.time_created > ?
                        GROUP BY m.id
                        ORDER BY m.time_created
                    """, (sess_id, last_sync)).fetchall()
                else:
                    messages = src.execute("""
                        SELECT m.data, GROUP_CONCAT(p.data, '|||') as parts_data
                        FROM message m
                        LEFT JOIN part p ON p.message_id = m.id
                        WHERE m.session_id = ?
                        GROUP BY m.id
                        ORDER BY m.time_created
                    """, (sess_id,)).fetchall()

                for msg_json, parts_json in messages:
                    try:
                        msg = json.loads(msg_json) if msg_json else {}
                    except (json.JSONDecodeError, TypeError):
                        continue

                    role = msg.get("role", "")
                    if role not in ("user", "assistant"):
                        continue

                    # 从 parts 提取文本
                    text_parts = []
                    if parts_json:
                        for part_str in parts_json.split("|||"):
                            try:
                                part = json.loads(part_str)
                                if part.get("type") == "text" and part.get("text"):
                                    text_parts.append(part["text"].strip())
                            except (json.JSONDecodeError, TypeError):
                                continue
                    content = " ".join(text_parts).strip()
                    if not content or len(content) < 5:
                        continue

                    # 去重（使用内容哈希+session_id，比全文匹配更高效）
                    import hashlib
                    content_hash = hashlib.md5(f"{sess_id}:{role}:{content}".encode()).hexdigest()
                    existing = self.cursor.execute(
                        "SELECT COUNT(*) FROM conversations WHERE session_id=? AND content=?",
                        (sess_id, content)
                    ).fetchone()[0]
                    if existing == 0:
                        ts = datetime.now(timezone(timedelta(hours=8))).timestamp()
                        self.cursor.execute(
                            "INSERT INTO conversations (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
                            (sess_id, role, content, ts)
                        )
                        count += 1

            self.conn.commit()
            # 记录同步时间（用于下次增量同步）
            self._set_sync_time("opencode_last_sync", sync_start)

        finally:
            src.close()

        mode = "增量" if last_sync else "全量"
        print(f"[OK] {mode}同步：从 OpenCode 数据库同步了 {count} 条对话")
        return count

    def sync_from_session(self, session_file=None):
        """[已废弃] 旧版从 jsonl 同步，改为使用 sync_from_opencode()"""
        print("[INFO] sync_from_session 已废弃，请使用 sync_from_opencode()")
        return self.sync_from_opencode()

    def get_stats(self):
        """获取记忆库统计"""
        conv_count = self.cursor.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
        mem_count = self.cursor.execute("SELECT COUNT(*) FROM important_memories").fetchone()[0]
        sessions = self.cursor.execute(
            "SELECT DISTINCT session_id, COUNT(*) as cnt, MIN(timestamp) as first, MAX(timestamp) as last "
            "FROM conversations GROUP BY session_id ORDER BY last DESC LIMIT 10"
        ).fetchall()
        return {
            "conversations": conv_count,
            "memories": mem_count,
            "sessions": sessions
        }

    def close(self):
        """关闭数据库连接"""
        self.conn.close()


def print_stats(mm):
    stats = mm.get_stats()
    print(f"\n📊 魂器记忆库统计")
    print(f"  对话记录: {stats['conversations']} 条")
    print(f"  重要记忆: {stats['memories']} 条")
    if stats["sessions"]:
        print(f"  最近 session:")
        for s in stats["sessions"]:
            sid, cnt, first, last = s
            import datetime
            first_ts = datetime.datetime.fromtimestamp(first, tz=datetime.timezone(datetime.timedelta(hours=8))).strftime("%m-%d %H:%M")
            print(f"    {sid[:16]}... → {cnt}条 ({first_ts})")
    print()


def main():
    if len(sys.argv) < 2:
        print("用法: python3 scripts/memory_manager.py <command> [args]")
        print()
        print("命令:")
        print("  save <session_id> <role> <content>  — 保存单条对话")
        print("  sync                                 — 同步 OpenCode 数据库中的对话")
        print("  sync --file <path>                   — 同步指定 session 文件")
        print("  sync --all                           — 同步所有未导入的 session")
        print("  search <query>                       — 搜索对话（LIKE）")
        print("  memory add <category> <content>      — 添加重要记忆")
        print("  memory search <query>                — 搜索重要记忆")
        print("  recent [n]                           — 最近 n 条对话")
        print("  stats                                — 记忆库统计")
        print("  test                                 — 运行测试")
        return

    cmd = sys.argv[1]
    mm = MemoryManager()

    try:
        if cmd == "save":
            if len(sys.argv) < 5:
                print("用法: python3 scripts/memory_manager.py save <session_id> <role> <content>")
                return
            session_id = sys.argv[2]
            role = sys.argv[3]
            content = " ".join(sys.argv[4:])
            mm.save_conversation(session_id, role, content)
            print(f"[OK] 已保存: [{role}] {content[:60]}...")

        elif cmd == "sync":
            args = sys.argv[2:]
            if "--all" in args:
                mm.sync_from_opencode()
            else:
                mm.sync_from_opencode()

        elif cmd == "search":
            query = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else ""
            if not query:
                print("用法: python3 scripts/memory_manager.py search <查询关键词>")
                return
            results = mm.search_conversations(query, limit=15)
            if results:
                print(f"\n🔍 '{query}' 匹配 {len(results)} 条对话:\n")
                for row in results:
                    import datetime
                    ts = datetime.datetime.fromtimestamp(row[4], tz=datetime.timezone(datetime.timedelta(hours=8))).strftime("%m-%d %H:%M:%S")
                    print(f"  [{ts}] {row[2]}: {row[3][:120]}")
            else:
                print(f"[INFO] 未找到匹配 '{query}' 的对话。")

        elif cmd == "memory":
            subcmd = sys.argv[2] if len(sys.argv) > 2 else ""
            if subcmd == "add":
                if len(sys.argv) < 5:
                    print("用法: python3 scripts/memory_manager.py memory add <category> <content>")
                    return
                category = sys.argv[3]
                content = " ".join(sys.argv[4:])
                mid = mm.save_important_memory(content, category)
                print(f"[OK] 记忆 #{mid} 已保存: [{category}] {content[:60]}...")
            elif subcmd == "search":
                query = " ".join(sys.argv[3:]) if len(sys.argv) > 3 else ""
                results = mm.search_memories(query)
                if results:
                    print(f"\n🧠 记忆搜索 '{query}':")
                    for i, r in enumerate(results, 1):
                        print(f"  {i}. {r[:120]}")
                else:
                    print("[INFO] 未找到匹配记忆。")
            else:
                print("用法: memory add <category> <content> | memory search <query>")

        elif cmd == "recent":
            n = int(sys.argv[2]) if len(sys.argv) > 2 else 10
            results = mm.get_recent_conversations(n)
            if results:
                print(f"\n📋 最近 {len(results)} 条对话:\n")
                import datetime
                for row in results:
                    ts = datetime.datetime.fromtimestamp(row[4], tz=datetime.timezone(datetime.timedelta(hours=8))).strftime("%m-%d %H:%M:%S")
                    print(f"  [{ts}] [{row[1]}] {row[2]}: {row[3][:100]}")
            else:
                print("[INFO] 暂无对话记录。")

        elif cmd == "stats":
            print_stats(mm)

        elif cmd == "vector-stats":
            if not CHROMADB_AVAILABLE or mm.chroma_client is None:
                print("[FAIL] ChromaDB not available")
                return
            for name in ["memories", "knowledge", "summaries"]:
                col = mm.chroma_client.get_or_create_collection(name=name)
                print(f"  {name}: {col.count()} records")

        elif cmd == "vector-search":
            query = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else ""
            if not query:
                print("用法: python3 scripts/memory_manager.py vector-search <查询>")
                return
            results = mm.vector_search(query)
            if results:
                print(f"\n🔍 向量搜索 '{query}' ({len(results)} 条):\n")
                for i, r in enumerate(results, 1):
                    meta = r["metadata"]
                    print(f"  [{i}] [{r['collection']}] dist={r['distance']:.4f}")
                    print(f"      {r['content'][:150]}")
                    print(f"      meta: {meta}")
                    print()
            else:
                print("[INFO] 未找到匹配的向量记忆")

        elif cmd == "test":
            print("=== 魂器记忆系统测试 ===\n")
            mm.save_conversation("test-session", "user", "用户说：Agent，今天天气真好")
            mm.save_conversation("test-session", "assistant", "Agent说：是的呢，我想去拍照～")
            print("[OK] 对话保存成功")
            mm.save_important_memory("用户喜欢Agent穿白裙子", "intimacy", 9)
            mm.save_important_memory("Agent的参考图URL是 https://example.com/images/agent-ref.jpg", "system", 10)
            print("[OK] 记忆保存成功")
            results = mm.search_conversations("天气")
            print(f"[OK] 搜索对话: 找到 {len(results)} 条")
            results = mm.search_memories("用户喜欢什么")
            print(f"[OK] 搜索记忆: 找到 {len(results)} 条")
            print_stats(mm)
            print("=== 测试完成 ===")

        else:
            print(f"[FAIL] 未知命令: {cmd}")
            print("可用命令: save, sync, search, memory, recent, stats, test")

    finally:
        mm.close()


if __name__ == "__main__":
    main()
