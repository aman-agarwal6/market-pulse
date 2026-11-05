@echo off
title Market Pulse
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is required: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Installing dependencies... & call npm install --no-audit --no-fund)
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
node server.js
pause
