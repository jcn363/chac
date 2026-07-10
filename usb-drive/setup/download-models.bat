@echo off
REM Download recommended GGUF models for Chac (Windows)

set SCRIPT_DIR=%~dp0
set MODELS_DIR=%SCRIPT_DIR%..\models

echo === Chac Model Downloader ===
echo Downloading to: %MODELS_DIR%
echo.

if not exist "%MODELS_DIR%" mkdir "%MODELS_DIR%"

REM Check if curl is available
where curl >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: curl not found. Please install curl or use PowerShell.
    pause
    exit /b 1
)

REM Chat model: Qwen2.5-3B-Instruct
set CHAT_URL=https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf
set CHAT_FILE=%MODELS_DIR%\chat.gguf

if exist "%CHAT_FILE%" (
    echo ✓ chat.gguf already exists, skipping
) else (
    echo ↓ Downloading chat model (Qwen2.5-3B Q4_K_M^)...
    curl -L -o "%CHAT_FILE%" "%CHAT_URL%"
    echo ✓ chat.gguf downloaded
)

REM Embedding model: nomic-embed-text
set EMBED_URL=https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf
set EMBED_FILE=%MODELS_DIR%\embed.gguf

if exist "%EMBED_FILE%" (
    echo ✓ embed.gguf already exists, skipping
) else (
    echo ↓ Downloading embedding model (nomic-embed-text Q4_K_M^)...
    curl -L -o "%EMBED_FILE%" "%EMBED_URL%"
    echo ✓ embed.gguf downloaded
)

echo.
echo === Setup complete ===
echo Run launchers\start.bat to launch Chac
echo.
pause
