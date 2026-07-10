# Chac — USB Drive Layout

Portable RAG chat that runs from a USB flash drive. Insert → launch → chat.

```
chac/
├── bin/
│   ├── chac                        # Compiled Bun binary (or chac.exe on Windows)
│   └── llama.cpp/
│       └── llama-server/           # llama.cpp server binaries
│           ├── linux-x64/
│           ├── linux-arm64/
│           ├── darwin-x64/
│           ├── darwin-arm64/
│           └── windows-x64/
├── models/
│   ├── chat.gguf                   # Chat LLM model
│   └── embed.gguf                  # Embedding model
├── data/
│   └── chac.db                     # SQLite database (auto-created)
├── launchers/
│   ├── start.sh                    # Linux launcher
│   ├── start.bat                   # Windows launcher
│   └── start.command               # macOS launcher
└── setup/                          # First-run setup scripts
    ├── install.sh                  # Linux/macOS setup
    ├── install.bat                 # Windows setup
    └── download-models.sh          # Download recommended GGUF models
```

## Quick Start

1. Run `setup/download-models.sh` to download the LLM models (~4GB)
2. Double-click the launcher for your OS:
   - **Windows**: `launchers/start.bat`
   - **macOS**: `launchers/start.command`
   - **Linux**: `launchers/start.sh`
3. Open http://localhost:3000 in your browser

## Requirements

- USB drive with ~8GB free space (models + binary)
- No internet required after setup (fully offline)
- No installation required (portable binary)
