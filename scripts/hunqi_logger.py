#!/usr/bin/env python3
"""
Hunqi Logger — 魂器统一结构化日志模块
提供 JSON 结构化日志、统一格式、按组件分类
"""

import json
import os
import sys
import traceback
from datetime import datetime, timezone, timedelta
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
LOG_DIR = PROJECT_DIR / "logs"


class HunqiLogger:
    def __init__(self, component="hunqi", log_file=None, console=True):
        self.component = component
        self.console = console
        if log_file:
            self.log_path = LOG_DIR / log_file
        else:
            self.log_path = LOG_DIR / f"{component}.log"
        LOG_DIR.mkdir(parents=True, exist_ok=True)

    def _now(self):
        return datetime.now(timezone(timedelta(hours=8))).isoformat()

    def _write(self, level, message, **kwargs):
        record = {
            "timestamp": self._now(),
            "level": level,
            "component": self.component,
            "message": message,
        }
        if kwargs:
            record["extra"] = kwargs

        line = json.dumps(record, ensure_ascii=False, default=str)

        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")

        if self.console:
            print(f"[{level}] {message}", file=sys.stderr if level in ("ERROR", "WARN") else sys.stdout)

    def debug(self, message, **kwargs):
        self._write("DEBUG", message, **kwargs)

    def info(self, message, **kwargs):
        self._write("INFO", message, **kwargs)

    def warn(self, message, **kwargs):
        self._write("WARN", message, **kwargs)

    def error(self, message, exc_info=False, **kwargs):
        if exc_info:
            kwargs["traceback"] = traceback.format_exc()
        self._write("ERROR", message, **kwargs)

    def metric(self, name, value, **kwargs):
        self._write("METRIC", f"{name}={value}", metric_name=name, metric_value=value, **kwargs)


def get_logger(component):
    return HunqiLogger(component=component)
