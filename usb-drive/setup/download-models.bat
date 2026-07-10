@echo off
REM Download recommended GGUF models for Chac (Windows)
REM Chat: MiniCPM5-1B (Q4_K_M) — fast, small, 1B params
REM Embed: nomic-embed-text-v2-moe (Q4_K_M) — 768 dims
REM Vision: MiniCPM-V-4.6 (Q4_K_M) — multimodal

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

REM Chat model: MiniCPM5-1B Q4_K_M
set CHAT_URL=https://huggingface.co/openbmb/MiniCPM5-1B-GGUF/resolve/main/MiniCPM5-1B-Q4_K_M.gguf
set CHAT_FILE=%MODELS_DIR%\chat.gguf

if exist "%CHAT_FILE%" (
    echo chat.gguf already exists, skipping
) else (
    echo Downloading chat model (MiniCPM5-1B Q4_K_M^)...
    curl -L --progress-bar -o "%CHAT_FILE%" "%CHAT_URL%"
    echo chat.gguf downloaded
)

REM Embedding model: nomic-embed-text-v2-moe Q4_K_M
set EMBED_URL=https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe-GGUF/resolve/main/nomic-embed-text-v2-moe.Q4_K_M.gguf
set EMBED_FILE=%MODELS_DIR%\embed.gguf

if exist "%EMBED_FILE%" (
    echo embed.gguf already exists, skipping
) else (
    echo Downloading embedding model (nomic-embed-text-v2-moe Q4_K_M^)...
    curl -L --progress-bar -o "%EMBED_FILE%" "%EMBED_URL%"
    echo embed.gguf downloaded
)

REM Vision model: MiniCPM-V-4.6 Q4_K_M
set VISION_URL=https://huggingface.co/openbmb/MiniCPM-V-4.6-gguf/resolve/main/MiniCPM-V-4_6-Q4_K_M.gguf
set VISION_FILE=%MODELS_DIR%\vision.gguf

if exist "%VISION_FILE%" (
    echo vision.gguf already exists, skipping
) else (
    echo Downloading vision model (MiniCPM-V-4.6 Q4_K_M^)...
    curl -L --progress-bar -o "%VISION_FILE%" "%VISION_URL%"
    echo vision.gguf downloaded
)

echo.
echo === Setup complete ===
echo Models downloaded to: %MODELS_DIR%
echo.
echo Run launchers\start.bat to launch Chac
echo.
pause
