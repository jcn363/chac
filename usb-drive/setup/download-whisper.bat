@echo off
REM Download whisper.cpp binaries for Windows
REM Binary: whisper-cli

set SCRIPT_DIR=%~dp0
set ROOT_DIR=%SCRIPT_DIR%..
set BIN_DIR=%ROOT_DIR%\bin\whisper.cpp\windows-x64
set WHISPER_VERSION=v1.7.5
set RELEASE_BASE=https://github.com/ggerganov/whisper.cpp/releases/download

if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"

set ARCHIVE_NAME=whisper.cpp-%WHISPER_VERSION:v=%-bin-win-x64.zip
set ARCHIVE_URL=%RELEASE_BASE%/%WHISPER_VERSION%/%ARCHIVE_NAME%
set TMP_DIR=%TEMP%\chac-whisper

if exist "%BIN_DIR%\whisper-cli.exe" (
    echo whisper-cli already exists, skipping
    goto :done
)

echo Downloading whisper.cpp for windows-x64...
if not exist "%TMP_DIR%" mkdir "%TMP_DIR%"
curl -fsSL -o "%TMP_DIR%\whisper.zip" "%ARCHIVE_URL%"
if %errorlevel% neq 0 (
    echo WARNING: Failed to download whisper.cpp
    echo Whisper transcription will use placeholder text
    rmdir /s /q "%TMP_DIR%" 2>nul
    goto :done
)

cd "%TMP_DIR%"
powershell -command "Expand-Archive -Path whisper.zip -DestinationPath . -Force"
for /r %%f in (whisper-cli.exe) do copy "%%f" "%BIN_DIR%\" >nul 2>&1
cd "%SCRIPT_DIR%"
rmdir /s /q "%TMP_DIR%" 2>nul
echo whisper-cli installed for windows-x64

:done
echo.
echo === whisper.cpp setup complete ===
echo.
pause
