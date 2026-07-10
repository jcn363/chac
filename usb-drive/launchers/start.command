#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARCH=$(uname -m)

if [ "$ARCH" = "arm64" ]; then
  exec "$SCRIPT_DIR/bin/chac-darwin-arm64"
elif [ "$ARCH" = "x86_64" ]; then
  exec "$SCRIPT_DIR/bin/chac-darwin-x64"
else
  echo "Unsupported architecture: $ARCH"
  exit 1
fi
