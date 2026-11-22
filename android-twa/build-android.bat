@echo off
setlocal
echo ============================================================
echo   HSP delivery - Android .AAB (Play Console) ^& .APK Builder
echo ============================================================
cd /d "%~dp0"

where npx >nul 2>nul
if errorlevel 1 (
  echo Error: Node.js is required. Install Node.js 18+ from https://nodejs.org
  pause
  exit /b 1
)

echo.
echo [1/2] Generating Android Gradle project from twa-manifest.json...
call npx --yes @bubblewrap/cli update --skipVersionUpgrade
if errorlevel 1 exit /b 1

echo.
echo [2/2] Building signed Android App Bundle (.aab) and APK (.apk)...
call npx --yes @bubblewrap/cli build
if errorlevel 1 exit /b 1

echo.
echo ============================================================
echo   Build Complete!
echo   - Upload app-release-bundle.aab to Google Play Console
echo   - Install app-release-signed.apk on Android to test
echo ============================================================
pause
