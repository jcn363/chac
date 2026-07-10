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
│   └── llama.cpp/
│       └── llama-server/              # llama.cpp server binaries
│           ├── linux-x64/
│           ├── linux-arm64/
│           ├── darwin-x64/
│           ├── darwin-arm64/
│           └── windows-x64/
├── models/
│   ├── chat.gguf                      # Chat LLM model (~1.7 GB)
│   ├── embed.gguf                     # Embedding model (~130 MB)
│   └── vision.gguf                    # Vision model (~505 MB)
├── data/
│   └── chac.db                        # SQLite database (auto-created)
├── start.sh                           # Linux launcher (root level)
├── start.bat                          # Windows launcher (root level)
├── start.command                      # macOS launcher (root level)
├── launchers/
│   ├── start.sh                       # Linux launcher (source)
│   ├── start.bat                      # Windows launcher (source)
│   ├── start.command                  # macOS launcher (source)
│   └── README.txt                     # Launcher documentation
├── setup/
│   ├── install.sh                     # Linux/macOS setup
│   ├── install.bat                    # Windows setup
│   ├── download-models.sh             # Download recommended GGUF models
│   ├── download-models.bat            # Download models (Windows)
│   ├── download-llama.sh              # Download llama.cpp binaries
│   └── setup-all.sh                   # Full setup (all-in-one)
├── README.txt                         # Quick start guide
└── .gitignore
```

## Quick Start

1. Run `setup/download-models.sh` to download the LLM models (~4GB)
2. Double-click the launcher for your OS:
   - **Windows**: `start.bat`
   - **macOS**: `start.command`
   - **Linux**: `start.sh`
3. Open http://localhost:3000 in your browser

## Requirements

- USB drive with ~8GB free space (models + binary)
- No internet required after setup (fully offline)
- No installation required (portable binary)
