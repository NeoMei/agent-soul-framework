#!/bin/bash
# Restart opencode-serve process
# Usage: ./restart-serve.sh [port]

PORT=${1:-19876}

# Find and kill existing opencode-serve process
pkill -f "opencode serve.*--port $PORT" || true
sleep 1

# Start new opencode-serve process
cd "$(dirname "$0")/../.."
nohup opencode serve --port "$PORT" > /tmp/opencode-serve.log 2>&1 &

echo "opencode-serve restarted on port $PORT"
