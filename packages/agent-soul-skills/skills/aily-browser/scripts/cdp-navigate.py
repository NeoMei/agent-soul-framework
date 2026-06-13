#!/usr/bin/env python3
"""
CDP Navigate Script for aily-browser
Navigates to a URL via Chrome DevTools Protocol (CDP) over WebSocket.
This bypasses the agent-browser 'open' command which fails due to socks proxy issues.

Usage:
    python3 cdp-navigate.py https://www.example.com
"""

import socket
import json
import struct
import time
import os
import sys

CDP_HOST = "127.0.0.1"
CDP_PORT = 9222


def get_page_ws_url():
    """Get the WebSocket URL for the first page target."""
    import urllib.request
    req = urllib.request.Request(f"http://{CDP_HOST}:{CDP_PORT}/json/list")
    resp = urllib.request.urlopen(req, timeout=5)
    data = json.loads(resp.read().decode())
    for tab in data:
        if tab.get("type") == "page":
            return tab.get("webSocketDebuggerUrl")
    return None


def send_ws_message(sock, msg_obj):
    """Send a masked WebSocket text frame (client -> server)."""
    msg = json.dumps(msg_obj)
    msg_bytes = msg.encode("utf-8")
    mask = os.urandom(4)
    masked = bytearray(len(msg_bytes))
    for i in range(len(msg_bytes)):
        masked[i] = msg_bytes[i] ^ mask[i % 4]
    frame = struct.pack("!BB", 0x81, 0x80 | len(msg_bytes)) + mask + bytes(masked)
    sock.sendall(frame)


def recv_ws_frames(sock, timeout_sec=10):
    """Receive and parse unmasked WebSocket text frames from server."""
    sock.settimeout(timeout_sec)
    results = []
    try:
        while True:
            data = sock.recv(65536)
            if not data:
                break
            idx = 0
            while idx < len(data):
                if idx >= len(data):
                    break
                opcode = data[idx] & 0x0F
                fin = (data[idx] & 0x80) != 0
                idx += 1
                if idx >= len(data):
                    break
                payload_len = data[idx] & 0x7F
                idx += 1
                if payload_len == 126:
                    if idx + 2 > len(data):
                        break
                    payload_len = struct.unpack("!H", data[idx:idx + 2])[0]
                    idx += 2
                elif payload_len == 127:
                    if idx + 8 > len(data):
                        break
                    payload_len = struct.unpack("!Q", data[idx:idx + 8])[0]
                    idx += 8
                if idx + payload_len > len(data):
                    break
                payload = data[idx:idx + payload_len]
                idx += payload_len

                if opcode == 0x1:  # text
                    try:
                        d = json.loads(payload.decode("utf-8", errors="ignore"))
                        results.append(d)
                    except:
                        results.append({"_text": payload.decode("utf-8", errors="ignore")[:200]})
                elif opcode == 0x8:  # close
                    return results
    except socket.timeout:
        pass
    return results


def navigate(url):
    ws_url = get_page_ws_url()
    if not ws_url:
        print("Error: No page target found. Is Chrome running with --remote-debugging-port=9222?", file=sys.stderr)
        sys.exit(1)

    # Parse ws URL: ws://127.0.0.1:9222/devtools/page/...
    path = ws_url.replace(f"ws://{CDP_HOST}:{CDP_PORT}", "")

    sock = socket.create_connection((CDP_HOST, CDP_PORT))

    # WebSocket handshake
    import base64
    key = base64.b64encode(b"x" * 16).decode()
    handshake = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {CDP_HOST}:{CDP_PORT}\r\n"
        f"Upgrade: websocket\r\n"
        f"Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        f"Sec-WebSocket-Version: 13\r\n"
        f"\r\n"
    )
    sock.sendall(handshake.encode())
    resp = sock.recv(1024)
    if b"101" not in resp:
        print("Error: WebSocket handshake failed", file=sys.stderr)
        sys.exit(1)

    # Enable Page domain
    send_ws_message(sock, {"id": 1, "method": "Page.enable"})
    recv_ws_frames(sock, 2)

    # Navigate
    send_ws_message(sock, {"id": 2, "method": "Page.navigate", "params": {"url": url}})
    frames = recv_ws_frames(sock, 10)

    # Wait for load complete
    loaded = False
    for f in frames:
        if f.get("method") == "Page.loadEventFired":
            loaded = True
        if "id" in f and f.get("id") == 2:
            if f.get("result", {}).get("errorText"):
                print(f"Navigation error: {f['result']['errorText']}", file=sys.stderr)
                sys.exit(1)

    if loaded:
        # Get title
        send_ws_message(sock, {"id": 3, "method": "Runtime.evaluate", "params": {"expression": "document.title"}})
        title_frames = recv_ws_frames(sock, 3)
        for f in title_frames:
            if f.get("id") == 3:
                title = f.get("result", {}).get("result", {}).get("value", "")
                print(f"Loaded: {title}")
                break
    else:
        print("Warning: Page may not have fully loaded", file=sys.stderr)

    sock.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <url>", file=sys.stderr)
        sys.exit(1)
    navigate(sys.argv[1])
