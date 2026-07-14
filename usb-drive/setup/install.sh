#!/bin/bash
# Chac USB Drive Setup — Linux/macOS
# Sets up the Chac binary and launchers

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Chac USB Drive Setup ==="
echo "Root: $ROOT_DIR"
echo ""

ARCH=$(uname -m)
OS=$(uname -s)

case "$OS" in
  Linux)
    if [ "$ARCH" = "x86_64" ]; then
      PLATFORM="linux-x64"
    elif [ "$ARCH" = "aarch64" ]; then
      PLATFORM="linux-arm64"
    else
      echo "Unsupported architecture: $ARCH"
      exit 1
    fi
    ;;
  Darwin)
    if [ "$ARCH" = "arm64" ]; then
      PLATFORM="darwin-arm64"
    elif [ "$ARCH" = "x86_64" ]; then
      PLATFORM="darwin-x64"
    else
      echo "Unsupported architecture: $ARCH"
      exit 1
    fi
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

echo "Platform: $PLATFORM"

# Check if binary exists
BINARY="$ROOT_DIR/bin/chac"
if [ ! -f "$BINARY" ]; then
  echo ""
  echo "⚠️  Binary not found at $BINARY"
  echo "Build it first: bun run build"
  echo ""
  echo "Or copy the compiled binary manually:"
  echo "  cp out/chac-$PLATFORM $BINARY"
  echo "  chmod +x $BINARY"
  exit 1
fi

chmod +x "$BINARY"

# Make launchers executable
chmod +x "$ROOT_DIR/launchers/start.sh" 2>/dev/null || true
chmod +x "$ROOT_DIR/launchers/start.command" 2>/dev/null || true

# Make setup scripts executable
chmod +x "$SCRIPT_DIR/download-models.sh" 2>/dev/null || true
chmod +x "$SCRIPT_DIR/download-llama.sh" 2>/dev/null || true
chmod +x "$SCRIPT_DIR/download-whisper.sh" 2>/dev/null || true

echo ""
echo "✓ Setup complete"
echo ""
echo "Next steps:"
echo "  1. Run setup/setup-all.sh (recommended — offers download or build from source)"
echo "  2. Or run individual scripts:"
echo "     - setup/download-models.sh      (GGUF models ~4GB)"
echo "     - setup/download-llama.sh       (llama.cpp pre-built binaries)"
echo "     - setup/download-whisper.sh     (whisper.cpp pre-built binaries)"
echo "     - Or build from source via setup-all.sh (requires cmake + C++)"
echo "  3. Run launchers/start.sh (or double-click start.command on macOS)"
echo "  4. Open http://localhost:3000"
