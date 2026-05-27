#!/bin/bash

# Music Creator — OpenCLI Adapters 安装脚本

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Music Creator — OpenCLI Adapters Installer${NC}"
echo "=========================================="
echo ""

# Check if OpenCLI is installed
if ! command -v opencli &> /dev/null; then
    echo -e "${RED}Error: OpenCLI is not installed.${NC}"
    echo "Please install OpenCLI first:"
    echo "  npm install -g @jackwener/opencli"
    exit 1
fi

# Check OpenCLI version
OPENCLI_VERSION=$(opencli --version 2>/dev/null | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+' | head -1)
if [ -z "$OPENCLI_VERSION" ]; then
    echo -e "${YELLOW}Warning: Could not determine OpenCLI version.${NC}"
else
    echo -e "${GREEN}✓ OpenCLI version: $OPENCLI_VERSION${NC}"
fi

# Determine target directory
if [ -n "$OPENCLI_HOME" ]; then
    TARGET_DIR="$OPENCLI_HOME/clis"
elif [ -d "$HOME/.opencli/clis" ]; then
    TARGET_DIR="$HOME/.opencli/clis"
else
    echo -e "${RED}Error: OpenCLI clis directory not found.${NC}"
    echo "Expected: ~/.opencli/clis/"
    exit 1
fi

echo "Target directory: $TARGET_DIR"

# Create directories if they don't exist
mkdir -p "$TARGET_DIR/suno"
mkdir -p "$TARGET_DIR/douyin-music"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if adapters directory exists
if [ ! -d "$SCRIPT_DIR/adapters" ]; then
    echo -e "${RED}Error: adapters/ directory not found.${NC}"
    echo "Please run this script from the music-creator repository root."
    exit 1
fi

# Copy Suno adapters
echo ""
echo "Installing Suno adapters..."
cp "$SCRIPT_DIR/adapters/suno/"*.js "$TARGET_DIR/suno/"
echo -e "${GREEN}✓ Suno adapters installed${NC}"

# Copy Douyin Music adapters
echo ""
echo "Installing Douyin Music adapters..."
cp "$SCRIPT_DIR/adapters/douyin-music/"*.js "$TARGET_DIR/douyin-music/"
echo -e "${GREEN}✓ Douyin Music adapters installed${NC}"

# Verify installation
echo ""
echo "Verifying installation..."

# Check if adapters can be loaded
if opencli suno create-advanced --help >/dev/null 2>&1; then
    echo -e "${GREEN}✓ suno create-advanced — OK${NC}"
else
    echo -e "${YELLOW}⚠ suno create-advanced — failed to load${NC}"
fi

if opencli suno generate-wav --help >/dev/null 2>&1; then
    echo -e "${GREEN}✓ suno generate-wav — OK${NC}"
else
    echo -e "${YELLOW}⚠ suno generate-wav — failed to load${NC}"
fi

if opencli suno download --help >/dev/null 2>&1; then
    echo -e "${GREEN}✓ suno download — OK${NC}"
else
    echo -e "${YELLOW}⚠ suno download — failed to load${NC}"
fi

if opencli douyin-music publish --help >/dev/null 2>&1; then
    echo -e "${GREEN}✓ douyin-music publish — OK${NC}"
else
    echo -e "${YELLOW}⚠ douyin-music publish — failed to load${NC}"
fi

# Set environment variable hint
echo ""
echo "=========================================="
echo -e "${GREEN}Installation complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Ensure Chrome is running and logged into:"
echo "   - suno.com (Premier subscription required for WAV)"
echo "   - music.douyin.com (creator account required)"
echo ""
echo "2. Set environment variable (add to ~/.bashrc or ~/.zshrc):"
echo "   export OPENCLI_BROWSER_COMMAND_TIMEOUT=600"
echo ""
echo "3. Test with:"
echo "   opencli suno create-advanced --help"
echo "   opencli douyin-music publish --help"
echo ""
echo "See README.md for detailed usage."
