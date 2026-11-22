@echo off
setlocal
echo ============================================================
echo   HSP delivery - Android .AAB (Play Console) ^& .APK Builder
echo ============================================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Error: Node.js 18+ is required. Install from https://nodejs.org
  pause
  exit /b 1
)

node .\run-bubblewrap.mjs
if errorlevel 1 (
  pause
  exit /b 1
)

pause
