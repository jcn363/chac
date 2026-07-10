#!/bin/bash
# Download recommended GGUF models for Chac
# Run from the usb-drive root directory

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$(dirname "$SCRIPT_DIR")/models"

echo "=== Chac Model Downloader ==="
echo "Downloading to: $MODELS_DIR"
echo ""

mkdir -p "$MODELS_DIR"

# Chat model: Qwen2.5-3B-Instruct (small, fast, good quality)
CHAT_URL="https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf"
CHAT_FILE="$MODELS_DIR/chat.gguf"

if [ -f "$CHAT_FILE" ]; then
  echo "✓ chat.gguf already exists, skipping"
else
  echo "↓ Downloading chat model (Qwen2.5-3B Q4_K_M)..."
  curl -L -o "$CHAT_FILE" "$CHAT_URL"
  echo "✓ chat.gguf downloaded"
fi

# Embedding model: nomic-embed-text (768 dims, small)
EMBED_URL="https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf"
EMBED_FILE="$MODELS_DIR/embed.gguf"

if [ -f "$EMBED_FILE" ]; then
  echo "✓ embed.gguf already exists, skipping"
else
  echo "↓ Downloading embedding model (nomic-embed-text Q4_K_M)..."
  curl -L -o "$EMBED_FILE" "$EMBED_URL"
  echo "✓ embed.gguf downloaded"
fi

echo ""
echo "=== Setup complete ==="
echo "Models downloaded to: $MODELS_DIR"
echo "Run launchers/start.sh to launch Chac"
