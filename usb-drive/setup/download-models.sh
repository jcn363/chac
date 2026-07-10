#!/bin/bash
# Download GGUF models for Chac
# Chat: MiniCPM5-1B (Q4_K_M) — fast, small, 1B params
# Embed: nomic-embed-text-v2-moe (Q4_K_M) — 768 dims
# Vision: MiniCPM-V-4.6 (Q4_K_M) — multimodal
# Run from the usb-drive root directory

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$(dirname "$SCRIPT_DIR")/models"

echo "=== Chac Model Downloader ==="
echo "Downloading to: $MODELS_DIR"
echo ""

mkdir -p "$MODELS_DIR"

download() {
  local name="$1"
  local url="$2"
  local file="$MODELS_DIR/$3"

  if [ -f "$file" ]; then
    echo "✓ $name already exists, skipping"
    return
  fi

  echo "↓ Downloading $name..."
  curl -L --progress-bar -o "$file" "$url"
  echo "✓ $name downloaded ($(du -h "$file" | cut -f1))"
}

# Chat model: MiniCPM5-1B Q4_K_M
download "chat model (MiniCPM5-1B Q4_K_M)" \
  "https://huggingface.co/openbmb/MiniCPM5-1B-GGUF/resolve/main/MiniCPM5-1B-Q4_K_M.gguf" \
  "chat.gguf"

# Embedding model: nomic-embed-text-v2-moe Q4_K_M
download "embedding model (nomic-embed-text-v2-moe Q4_K_M)" \
  "https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe-GGUF/resolve/main/nomic-embed-text-v2-moe.Q4_K_M.gguf" \
  "embed.gguf"

# Vision model: MiniCPM-V-4.6 Q4_K_M
download "vision model (MiniCPM-V-4.6 Q4_K_M)" \
  "https://huggingface.co/openbmb/MiniCPM-V-4.6-gguf/resolve/main/MiniCPM-V-4_6-Q4_K_M.gguf" \
  "vision.gguf"

echo ""
echo "=== Setup complete ==="
echo "Models downloaded to: $MODELS_DIR"
ls -lh "$MODELS_DIR"/*.gguf 2>/dev/null
echo ""
echo "Run launchers/start.sh to launch Chac"
