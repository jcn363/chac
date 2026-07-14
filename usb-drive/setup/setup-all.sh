#!/bin/bash
# Chac USB Drive — Full Setup
# Builds or downloads llama.cpp + whisper.cpp, then downloads GGUF models
# Run once before first use

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# ─── Platform Detection ──────────────────────────────────────────────────────
ARCH=$(uname -m)
OS=$(uname -s)
case "$OS" in
  Linux)
    if [ "$ARCH" = "x86_64" ]; then PLATFORM="linux-x64";
    elif [ "$ARCH" = "aarch64" ]; then PLATFORM="linux-arm64";
    else echo "Unsupported architecture: $ARCH"; exit 1; fi
    ;;
  Darwin)
    if [ "$ARCH" = "arm64" ]; then PLATFORM="darwin-arm64";
    elif [ "$ARCH" = "x86_64" ]; then PLATFORM="darwin-x64";
    else echo "Unsupported architecture: $ARCH"; exit 1; fi
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

echo "╔══════════════════════════════════════╗"
echo "║      Chac USB Drive Setup            ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Platform: $PLATFORM"
echo ""

# ─── Check Build Tools ───────────────────────────────────────────────────────
can_build() {
  command -v cmake >/dev/null 2>&1 &&
  command -v make >/dev/null 2>&1 &&
  (command -v g++ >/dev/null 2>&1 || command -v clang++ >/dev/null 2>&1)
}

HAS_BUILD_TOOLS=false
if can_build; then
  HAS_BUILD_TOOLS=true
  echo "✓ Build tools found (cmake, make, g++/clang++)"
else
  echo "⚠ Build tools not found (cmake/make/g++). Only download option available."
  echo "  Install with:"
  echo "    Linux:  sudo apt install cmake build-essential"
  echo "    macOS:  xcode-select --install"
fi
echo ""

# ─── Step 0: Install Chac binary + launchers ─────────────────────────────────
bash "$SCRIPT_DIR/install.sh"
echo ""

# ─── Build from Source ───────────────────────────────────────────────────────
build_from_source() {
  local LLAMA_DIR="$ROOT_DIR/llama.cpp"
  local WHISPER_DIR="$ROOT_DIR/whisper.cpp"
  local JOBS=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

  # ── llama.cpp ──
  if [ -d "$LLAMA_DIR" ]; then
    echo "→ Updating llama.cpp..."
    git -C "$LLAMA_DIR" pull --ff-only || echo "⚠ git pull failed, using existing checkout"
  else
    echo "→ Cloning llama.cpp..."
    git clone --depth 1 https://github.com/ggerganov/llama.cpp.git "$LLAMA_DIR"
  fi

  echo "→ Building llama.cpp (${JOBS} parallel jobs)..."
  cd "$LLAMA_DIR"
  cmake -B build -DCMAKE_BUILD_TYPE=Release
  cmake --build build --config Release -j"$JOBS"

  # Copy llama-server binary
  LLAMA_BIN="$ROOT_DIR/bin/llama.cpp/llama-server/$PLATFORM"
  mkdir -p "$LLAMA_BIN"
  if [ -f "build/bin/llama-server" ]; then
    cp "build/bin/llama-server" "$LLAMA_BIN/"
  elif [ -f "build/bin/Release/llama-server" ]; then
    cp "build/bin/Release/llama-server" "$LLAMA_BIN/"
  else
    FOUND=$(find build -name "llama-server" -type f 2>/dev/null | head -1)
    if [ -n "$FOUND" ]; then
      cp "$FOUND" "$LLAMA_BIN/"
    else
      echo "⚠ Could not find llama-server in build output"
    fi
  fi
  chmod +x "$LLAMA_BIN/llama-server" 2>/dev/null || true
  echo "✓ llama.cpp built for $PLATFORM → $LLAMA_BIN/"

  # ── whisper.cpp ──
  if [ -d "$WHISPER_DIR" ]; then
    echo "→ Updating whisper.cpp..."
    git -C "$WHISPER_DIR" pull --ff-only || echo "⚠ git pull failed, using existing checkout"
  else
    echo "→ Cloning whisper.cpp..."
    git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "$WHISPER_DIR"
  fi

  echo "→ Building whisper.cpp (${JOBS} parallel jobs)..."
  cd "$WHISPER_DIR"
  cmake -B build -DCMAKE_BUILD_TYPE=Release
  cmake --build build --config Release -j"$JOBS"

  # Copy whisper-cli binary
  WHISPER_BIN="$ROOT_DIR/bin/whisper.cpp/$PLATFORM"
  mkdir -p "$WHISPER_BIN"
  if [ -f "build/bin/whisper-cli" ]; then
    cp "build/bin/whisper-cli" "$WHISPER_BIN/"
  elif [ -f "build/bin/Release/whisper-cli" ]; then
    cp "build/bin/Release/whisper-cli" "$WHISPER_BIN/"
  else
    FOUND=$(find build -name "whisper-cli" -type f 2>/dev/null | head -1)
    if [ -n "$FOUND" ]; then
      cp "$FOUND" "$WHISPER_BIN/"
    else
      echo "⚠ Could not find whisper-cli in build output"
    fi
  fi
  chmod +x "$WHISPER_BIN/whisper-cli" 2>/dev/null || true
  echo "✓ whisper.cpp built for $PLATFORM → $WHISPER_BIN/"

  cd "$SCRIPT_DIR"
}

# ─── Step 1: llama.cpp + whisper.cpp ─────────────────────────────────────────
if [ "$HAS_BUILD_TOOLS" = true ]; then
  echo "How would you like to install llama.cpp and whisper.cpp?"
  echo ""
  echo "  1) Download pre-built binaries (fast, requires internet)"
  echo "  2) Build from source (slower, requires cmake + C++)"
  echo "  3) Skip (use dev mode with mock responses)"
  read -p "Choice [1/2/3]: " choice
  [ "$choice" = "" ] && choice=1
else
  echo "How would you like to install llama.cpp and whisper.cpp?"
  echo ""
  echo "  1) Download pre-built binaries (requires internet)"
  echo "  2) Skip (use dev mode with mock responses)"
  read -p "Choice [1/2]: " choice
  [ "$choice" = "" ] && choice=1
  [ "$choice" = "3" ] && choice=2
fi

case "$choice" in
  1)
    echo ""
    echo "→ Downloading llama.cpp..."
    bash "$SCRIPT_DIR/download-llama.sh"
    echo ""
    echo "→ Downloading whisper.cpp..."
    bash "$SCRIPT_DIR/download-whisper.sh"
    echo ""
    ;;
  2)
    if [ "$HAS_BUILD_TOOLS" = false ]; then
      echo ""
      echo "ERROR: Cannot build from source without cmake + C++ compiler"
      echo "Install with: sudo apt install cmake build-essential  (Linux)"
      echo "              xcode-select --install                    (macOS)"
      exit 1
    fi
    echo ""
    build_from_source
    ;;
  *)
    echo ""
    echo "Skipping llama.cpp and whisper.cpp."
    echo "Chac will run in dev mode with mock responses."
    ;;
esac

# ─── Step 2: GGUF Models ────────────────────────────────────────────────────
echo ""
read -p "Download GGUF models (~4GB)? (Y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  bash "$SCRIPT_DIR/download-models.sh"
fi

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════╗"
echo "║      Setup Complete!                 ║"
echo "║                                      ║"
echo "║  Run: launchers/start.sh             ║"
echo "║  Open: http://localhost:3000         ║"
echo "║  Features: LLM chat + transcription  ║"
echo "╚══════════════════════════════════════╝"
