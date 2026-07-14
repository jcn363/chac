#!/bin/bash
# Download whisper.cpp binaries for all platforms
# Binary: whisper-cli
# Requires: curl, unzip/tar
# Run from the usb-drive root directory

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$ROOT_DIR/bin/whisper.cpp"

# Use a recent stable release
WHISPER_VERSION="v1.7.5"
RELEASE_BASE="https://github.com/ggerganov/whisper.cpp/releases/download"

echo "=== Chac whisper.cpp Downloader ==="
echo "Version: $WHISPER_VERSION"
echo "Target: $BIN_DIR"
echo ""

download_and_extract() {
  local platform_key="$1"
  local archive_name="$2"
  local url="$RELEASE_BASE/$WHISPER_VERSION/$archive_name"
  local target_dir="$BIN_DIR/$platform_key"
  local tmp_dir="/tmp/chac-whisper-$platform_key"

  if [ -f "$target_dir/whisper-cli" ] || [ -f "$target_dir/whisper-cli.exe" ]; then
    echo "✓ $platform_key already present, skipping"
    return
  fi

  echo "↓ Downloading whisper.cpp for $platform_key..."
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
    # Find whisper-cli binary and copy to target
    find . -name "whisper-cli" -o -name "whisper-cli.exe" | while read f; do
      cp "$f" "$target_dir/"
    done
    chmod +x "$target_dir/whisper-cli" 2>/dev/null || true
    cd "$ROOT_DIR"
    rm -rf "$tmp_dir"
    echo "✓ $platform_key installed"
  else
    echo "⚠ Failed to download for $platform_key (whisper transcription will use placeholder)"
    rm -rf "$tmp_dir"
  fi
}

# Archive naming may vary by release — if downloads fail, check
# https://github.com/ggerganov/whisper.cpp/releases for exact filenames.

# Linux x64
download_and_extract "linux-x64" "whisper.cpp-${WHISPER_VERSION#v}-bin-ubuntu-x64.tar.gz"

# Linux ARM64
download_and_extract "linux-arm64" "whisper.cpp-${WHISPER_VERSION#v}-bin-ubuntu-arm64.tar.gz"

# macOS ARM64
download_and_extract "darwin-arm64" "whisper.cpp-${WHISPER_VERSION#v}-bin-macos-arm64.tar.gz"

# macOS x64
download_and_extract "darwin-x64" "whisper.cpp-${WHISPER_VERSION#v}-bin-macos-x64.tar.gz"

# Windows x64
download_and_extract "windows-x64" "whisper.cpp-${WHISPER_VERSION#v}-bin-win-x64.zip"

echo ""
echo "=== whisper.cpp setup complete ==="
echo ""
echo "Installed platforms:"
for d in "$BIN_DIR"/*/; do
  if [ -f "$d/whisper-cli" ] || [ -f "$d/whisper-cli.exe" ]; then
    echo "  ✓ $(basename "$d")"
  else
    echo "  ✗ $(basename "$d") (not downloaded)"
  fi
done
