#!/bin/bash
# agent-browser wrapper that unsets SOCKS proxy before running
# This fixes ERR_NO_SUPPORTED_PROXIES error

unset ALL_PROXY
unset all_proxy

export AGENT_BROWSER_CONFIG="/home/neomei/.openclaw/workspace/skills/aily-browser/agent-browser.json"

exec /usr/local/bin/agent-browser "$@"
