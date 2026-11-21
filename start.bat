@echo off
title Market Pulse
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

set NODEMAJOR=
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODEMAJOR=%%v
if "%NODEMAJOR%"=="" goto nonode
if %NODEMAJOR% LSS 24 (
  echo You have Node.js %NODEMAJOR%, but Market Pulse needs Node.js 24 or newer.
  echo Install the current LTS version from https://nodejs.org , then double-click start.bat again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies. This happens only the first time and takes about a minute...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo Installing dependencies failed. Check your internet connection, then double-click start.bat again.
    pause
    exit /b 1
  )
)

if "%PORT%"=="" set PORT=3000
echo.
echo Starting Market Pulse at http://localhost:%PORT%
echo Your browser opens in a few seconds. Close this window or press Ctrl+C to stop.
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:%PORT%"
node server.js
pause
exit /b 0

:nonode
echo Market Pulse needs Node.js 24 or newer, and it was not found on this computer.
echo Download the LTS installer from https://nodejs.org , install it, then double-click start.bat again.
pause
exit /b 1
