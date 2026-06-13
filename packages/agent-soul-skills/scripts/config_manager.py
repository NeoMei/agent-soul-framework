#!/usr/bin/env python3
"""
Hunqi Config Manager — 魂器配置管理器
支持：原子写入、自动备份、多文件统一管理
"""

import json
import os
import shutil
import threading
from datetime import datetime
from pathlib import Path


class ConfigManager:
    def __init__(self, config_path, backup_count=5):
        self.config_path = Path(config_path)
        self.backup_count = backup_count
        self._lock = threading.Lock()

    def load(self):
        with open(self.config_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def save(self, config):
        with self._lock:
            self._backup()
            self._atomic_write(config)

    def update_field(self, key, value):
        with self._lock:
            config = self.load()
            config[key] = value
            self._backup()
            self._atomic_write(config)

    def _backup(self):
        if not self.config_path.exists():
            return
        ts = datetime.now().strftime("%Y%m%d%H%M%S")
        backup_path = self.config_path.with_suffix(f".backup.{ts}")
        shutil.copy2(self.config_path, backup_path)

        backups = sorted(
            self.config_path.parent.glob(f"{self.config_path.name}.backup.*"),
            key=lambda p: p.stat().st_mtime
        )
        for old in backups[:-self.backup_count]:
            old.unlink(missing_ok=True)

    def _atomic_write(self, config):
        temp_path = self.config_path.with_suffix(".tmp")
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(temp_path, self.config_path)
        except Exception:
            if temp_path.exists():
                temp_path.unlink(missing_ok=True)
            raise


class MultiConfigManager:
    def __init__(self, project_dir):
        self.project_dir = Path(project_dir)
        self._managers = {}

    def get(self, relative_path, backup_count=5):
        if relative_path not in self._managers:
            full_path = self.project_dir / relative_path
            self._managers[relative_path] = ConfigManager(full_path, backup_count)
        return self._managers[relative_path]

    def load(self, relative_path):
        return self.get(relative_path).load()

    def save(self, relative_path, config):
        self.get(relative_path).save(config)

    def update_field(self, relative_path, key, value):
        self.get(relative_path).update_field(key, value)
