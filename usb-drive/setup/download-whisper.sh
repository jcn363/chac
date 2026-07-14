#!/bin/bash
# Download whisper.cpp binaries for all platforms
# Binary: whisper-cli
# Requires: curl, unzip/tar
# Run from the usb-drive root directory
#
# To update the version, change WHISPER_VERSION below and update
# the asset names if the release naming convention changes.
# Check https://github.com/ggml-org/whisper.cpp/releases for current assets.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$ROOT_DIR/bin/whisper.cpp"

# ── Configurable version ──────────────────────────────────────────
WHISPER_VERSION="v1.9.1"  # Latest: check https://github.com/ggml-org/whisper.cpp/releases
RELEASE_BASE="https://github.com/ggml-org/whisper.cpp/releases/download"
# ──────────────────────────────────────────────────────────────────

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

# ── Platform downloads ────────────────────────────────────────────
# Asset names from https://github.com/ggml-org/whisper.cpp/releases
# Update these if the release naming convention changes.

# Linux x64
download_and_extract "linux-x64" "whisper-bin-ubuntu-x64.tar.gz"

# Linux ARM64
download_and_extract "linux-arm64" "whisper-bin-ubuntu-arm64.tar.gz"

# Windows x64
download_and_extract "windows-x64" "whisper-bin-x64.zip"

# macOS — no pre-built CLI binary available
# The macOS release only contains an xcframework (library), not the whisper-cli binary.
# macOS users must build from source: cmake -B build && cmake --build build
# Or use setup-all.sh option 2 (build from source).
echo ""
echo "⚠ macOS: No pre-built whisper-cli binary available."
echo "  Build from source: cd whisper.cpp && cmake -B build && cmake --build build"
echo "  Or use: setup-all.sh → option 2 (build from source)"

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
