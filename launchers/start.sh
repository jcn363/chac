#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARCH=$(uname -m)

if [ "$ARCH" = "x86_64" ]; then
  exec "$SCRIPT_DIR/bin/chac-linux-x64"
elif [ "$ARCH" = "aarch64" ]; then
  exec "$SCRIPT_DIR/bin/chac-linux-arm64"
else
  echo "Unsupported architecture: $ARCH"
  exit 1
fi
