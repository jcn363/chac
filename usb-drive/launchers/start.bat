@echo off
set SCRIPT_DIR=%~dp0
if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
  "%SCRIPT_DIR%bin\chac-windows-x64.exe"
) else (
  echo Unsupported architecture: %PROCESSOR_ARCHITECTURE%
  exit /b 1
)
