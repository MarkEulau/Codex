@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20+ is required to run this app.
  echo Install Node.js from https://nodejs.org/ and then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found on your PATH.
  echo Reinstall Node.js and make sure npm is included.
  pause
  exit /b 1
)

if not exist node_modules\ws (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting the Catan server on http://localhost:8000 ...
start "Catan Server" cmd /k "cd /d ""%~dp0"" && npm start"
timeout /t 2 /nobreak >nul
start "" http://localhost:8000

echo Catan is opening in your browser.
echo Keep the "Catan Server" window open while you play.
