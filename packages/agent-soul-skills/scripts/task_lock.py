#!/usr/bin/env python3
"""
Task Lock Manager — 魂器统一任务锁管理
所有知识任务都通过这里获取/释放锁，防止重复执行
"""

import os
import time
import fcntl
from datetime import datetime

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCK_DIR = os.path.join(PROJECT_DIR, "memory", ".locks")


def _ensure_lock_dir():
    os.makedirs(LOCK_DIR, exist_ok=True)


def _get_lock_path(task_id):
    _ensure_lock_dir()
    return os.path.join(LOCK_DIR, f"{task_id}.lock")


def is_locked(task_id, timeout_minutes=30):
    lock_path = _get_lock_path(task_id)
    if not os.path.exists(lock_path):
        return False
    try:
        lock_time = os.path.getmtime(lock_path)
        elapsed = time.time() - lock_time
        if elapsed > timeout_minutes * 60:
            print(f"[LOCK] {task_id} 锁已超时 ({elapsed/60:.1f}分钟)，清理旧锁")
            release_lock(task_id)
            return False
        print(f"[LOCK] {task_id} 正在执行中 (已运行 {elapsed/60:.1f}分钟)")
        return True
    except Exception as e:
        print(f"[LOCK] 检查锁时出错: {e}")
        return False


def acquire_lock(task_id, timeout_minutes=30):
    """原子性获取文件锁，避免竞态条件"""
    lock_path = _get_lock_path(task_id)
    lock_fd = None
    try:
        # 先尝试非阻塞获取文件锁（原子操作）
        lock_fd = os.open(lock_path, os.O_CREAT | os.O_RDWR)
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (IOError, OSError):
            # 锁已被其他进程持有
            os.close(lock_fd)
            print(f"[LOCK] {task_id} 无法获取文件锁（其他进程正在执行）")
            return False

        # 获取到锁后，检查是否超时（处理崩溃遗留的锁文件）
        try:
            lock_time = os.path.getmtime(lock_path)
            elapsed = time.time() - lock_time
            if elapsed > timeout_minutes * 60:
                print(f"[LOCK] {task_id} 锁已超时 ({elapsed/60:.1f}分钟)，强制获取")
            else:
                # 锁有效且未超时，但当前进程已获取到锁
                # 说明是同一进程或锁文件被篡改，释放并返回失败
                content = os.read(lock_fd, 1024).decode().strip()
                if content and not content.startswith(str(os.getpid())):
                    fcntl.flock(lock_fd, fcntl.LOCK_UN)
                    os.close(lock_fd)
                    print(f"[LOCK] {task_id} 锁被其他进程持有")
                    return False
        except Exception:
            pass

        # 写入锁信息
        os.ftruncate(lock_fd, 0)
        os.lseek(lock_fd, 0, os.SEEK_SET)
        lock_info = f"{os.getpid()}\n{datetime.now().isoformat()}\n"
        os.write(lock_fd, lock_info.encode())
        os.fsync(lock_fd)

        print(f"[LOCK] {task_id} 成功获取锁")
        # 注意：不释放 flock，保持锁直到进程结束或显式释放
        return True

    except Exception as e:
        print(f"[LOCK] 获取锁失败: {e}")
        if lock_fd is not None:
            try:
                os.close(lock_fd)
            except Exception:
                pass
        return False


def release_lock(task_id):
    lock_path = _get_lock_path(task_id)
    try:
        if os.path.exists(lock_path):
            # 尝试获取并释放文件锁
            try:
                with open(lock_path, 'r') as f:
                    fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    fcntl.flock(f, fcntl.LOCK_UN)
            except (IOError, OSError):
                pass
            os.remove(lock_path)
            print(f"[LOCK] {task_id} 锁已释放")
    except Exception as e:
        print(f"[LOCK] 释放锁失败: {e}")


def check_and_lock(task_id, timeout_minutes=30):
    if is_locked(task_id, timeout_minutes):
        lock_path = _get_lock_path(task_id)
        try:
            with open(lock_path, 'r') as f:
                lines = f.readlines()
                lock_time = lines[1].strip() if len(lines) > 1 else "unknown"
                pid = lines[0].strip() if lines else "unknown"
        except Exception:
            lock_time = "unknown"
            pid = "unknown"
        return False, {
            'task_id': task_id,
            'locked': True,
            'lock_time': lock_time,
            'pid': pid,
            'message': f'任务 {task_id} 正在执行中（{lock_time}）'
        }
    if acquire_lock(task_id, timeout_minutes):
        return True, {
            'task_id': task_id,
            'locked': False,
            'message': f'任务 {task_id} 获取锁成功'
        }
    return False, {
        'task_id': task_id,
        'locked': True,
        'message': f'任务 {task_id} 获取锁失败（并发竞争）'
    }


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 3:
        print("Usage: python3 task_lock.py <check|acquire|release> <task_id>")
        sys.exit(1)
    action = sys.argv[1]
    task_id = sys.argv[2]
    if action == 'check':
        locked = is_locked(task_id)
        print(f"Task {task_id} locked: {locked}")
    elif action == 'acquire':
        result = acquire_lock(task_id)
        print(f"Acquire lock for {task_id}: {result}")
    elif action == 'release':
        release_lock(task_id)
        print(f"Released lock for {task_id}")
