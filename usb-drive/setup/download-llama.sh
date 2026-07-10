#!/bin/bash
# Download llama.cpp server binaries for all platforms
# Requires: curl, unzip/tar
# Run from the usb-drive root directory

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$ROOT_DIR/bin/llama.cpp/llama-server"

LLAMA_CPP_VERSION="b5510"
RELEASE_BASE="https://github.com/ggerganov/llama.cpp/releases/download"

echo "=== Chac llama.cpp Downloader ==="
echo "Version: $LLAMA_CPP_VERSION"
echo "Target: $BIN_DIR"
echo ""

download_and_extract() {
  local platform_key="$1"
  local archive_name="$2"
  local url="$RELEASE_BASE/$LLAMA_CPP_VERSION/$archive_name"
  local target_dir="$BIN_DIR/$platform_key"
  local tmp_dir="/tmp/chac-llama-$platform_key"

  if [ -f "$target_dir/llama-server" ] || [ -f "$target_dir/llama-server.exe" ]; then
    echo "✓ $platform_key already present, skipping"
    return
  fi

  echo "↓ Downloading llama.cpp for $platform_key..."
  rm -rf "$tmp_dir"
  mkdir -p "$tmp_dir"

  if curl -fsSL -o "$tmp_dir/$archive_name" "$url"; then
    mkdir -p "$target_dir"
    cd "$tmp_dir"
    if [[ "$archive_name" == *.zip ]]; then
      unzip -q "$archive_name"
    else
      tar xf "$archive_name"
    fi
    # Find and copy llama-server
    find . -name "llama-server" -o -name "llama-server.exe" | head -1 | xargs -I{} cp {} "$target_dir/"
    chmod +x "$target_dir/llama-server" 2>/dev/null || true
    cd "$ROOT_DIR"
    rm -rf "$tmp_dir"
    echo "✓ $platform_key installed"
  else
    echo "⚠ Failed to download for $platform_key (not critical, dev mode will be used)"
    rm -rf "$tmp_dir"
  fi
}

# Linux x64
download_and_extract "linux-x64" "llama.cpp-b${LLAMA_CPP_VERSION}-bin-ubuntu-x64.zip"

# Linux ARM64
download_and_extract "linux-arm64" "llama.cpp-b${LLAMA_CPP_VERSION}-bin-ubuntu-arm64.zip"

# macOS ARM64
download_and_extract "darwin-arm64" "llama.cpp-b${LLAMA_CPP_VERSION}-bin-macos-arm64.zip"

# macOS x64
download_and_extract "darwin-x64" "llama.cpp-b${LLAMA_CPP_VERSION}-bin-macos-x64.zip"

# Windows x64
download_and_extract "windows-x64" "llama.cpp-b${LLAMA_CPP_VERSION}-bin-win-x64.zip"

echo ""
echo "=== llama.cpp setup complete ==="
echo ""
echo "Installed platforms:"
for d in "$BIN_DIR"/*/; do
  if [ -f "$d/llama-server" ] || [ -f "$d/llama-server.exe" ]; then
    echo "  ✓ $(basename "$d")"
  else
    echo "  ✗ $(basename "$d") (not downloaded)"
  fi
done
