#!/bin/bash
# Chac USB Drive — Full Setup
# Downloads llama.cpp binaries + GGUF models
# Run once before first use

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "╔══════════════════════════════════════╗"
echo "║      Chac USB Drive Setup            ║"
echo "╚══════════════════════════════════════╝"
echo ""

bash "$SCRIPT_DIR/install.sh"
echo ""

read -p "Download llama.cpp binaries? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  bash "$SCRIPT_DIR/download-llama.sh"
  echo ""
fi

read -p "Download GGUF models (~4GB)? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  bash "$SCRIPT_DIR/download-models.sh"
  echo ""
fi

echo "╔══════════════════════════════════════╗"
echo "║      Setup Complete!                 ║"
echo "║                                      ║"
echo "║  Run: launchers/start.sh             ║"
echo "║  Open: http://localhost:3000         ║"
echo "╚══════════════════════════════════════╝"
