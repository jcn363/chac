# Chac — USB Drive Layout

Portable RAG chat that runs from a USB flash drive. Insert → launch → chat.

```
chac/
├── bin/
│   ├── chac                           # Compiled Bun binary
│   ├── chac-linux-x64                 # Platform-specific executables
│   ├── chac-linux-x64-baseline
│   ├── chac-linux-arm64
│   ├── chac-darwin-arm64
│   ├── chac-darwin-x64
│   ├── chac-darwin-x64-baseline
│   ├── chac-windows-x64.exe
│   ├── chac-windows-x64-baseline.exe
│   ├── llama.cpp/
│   │   └── llama-server/              # llama.cpp server binaries
│   │       ├── linux-x64/
│   │       ├── linux-arm64/
│   │       ├── darwin-x64/
│   │       ├── darwin-arm64/
│   │       └── windows-x64/
│   └── whisper.cpp/
│       └── whisper-cli/               # Whisper.cpp speech-to-text binaries
│           ├── linux-x64/
│           └── windows-x64/
├── models/
│   ├── chat.gguf                      # Chat LLM model (~1.7 GB)
│   ├── embed.gguf                     # Embedding model (~130 MB)
│   └── vision.gguf                    # Vision model (~505 MB)
├── data/                              # Runtime data (auto-created)
├── tmp/                               # Temporary upload files (auto-created)
├── start.sh                           # Linux launcher
├── start.bat                          # Windows launcher
├── start.command                      # macOS launcher
├── launchers/
│   ├── start.sh                       # Linux launcher (source)
│   ├── start.bat                      # Windows launcher (source)
│   └── start.command                  # macOS launcher (source)
├── setup/
│   ├── install.sh                     # Linux/macOS setup
│   ├── install.bat                    # Windows setup
│   ├── download-models.sh             # Download recommended GGUF models (Unix)
│   ├── download-models.bat            # Download models (Windows)
│   ├── download-llama.sh              # Download llama.cpp binaries
│   ├── download-whisper.sh            # Download whisper.cpp binaries (Unix)
│   ├── download-whisper.bat           # Download whisper.cpp binaries (Windows)
│   └── setup-all.sh                   # Full setup (all-in-one)
└── .gitignore
```

## Quick Start

1. Run `setup/setup-all.sh` (or `setup-all.bat` on Windows) for first-time setup
2. Double-click the launcher for your OS:
   - **Windows**: `start.bat`
   - **macOS**: `start.command`
   - **Linux**: `start.sh`
3. Open http://localhost:3000 in your browser

## Requirements

- USB drive with ~8GB free space (models + binary)
- No internet required after setup (fully offline)
- No installation required (portable binary)
