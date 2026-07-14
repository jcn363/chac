@echo off
REM Chac USB Drive Setup — Windows

set ROOT_DIR=%~dp0..

echo === Chac USB Drive Setup ===
echo Root: %ROOT_DIR%
echo.

REM Check if binary exists
set BINARY=%ROOT_DIR%\bin\chac.exe
if not exist "%BINARY%" (
    echo WARNING: Binary not found at %BINARY%
    echo.
    echo Build it first: bun run build
    echo.
    echo Or copy the compiled binary manually:
    echo   copy out\chac-windows-x64.exe "%BINARY%"
    echo.
    pause
    exit /b 1
)

REM Check architecture
if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    echo Platform: windows-x64
) else (
    echo Unsupported architecture: %PROCESSOR_ARCHITECTURE%
    pause
    exit /b 1
)

echo.
echo Setup complete.
echo.
echo Next steps:
echo   1. Run setup\download-models.bat to get the LLM models
echo   2. Run setup\download-llama.bat to get llama.cpp binaries
echo   3. Run setup\download-whisper.bat to get whisper.cpp binaries
echo   4. Run launchers\start.bat
echo   5. Open http://localhost:3000
echo.
pause
