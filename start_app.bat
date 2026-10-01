@echo off
setlocal
set "ROOT=%~dp0"

echo Starting FYP system...

if not exist "%ROOT%backend\venv\Scripts\python.exe" (
  echo Backend virtual environment is missing.
  echo Follow the Backend setup steps in README.md first.
  exit /b 1
)

if not exist "%ROOT%frontend\node_modules" (
  echo Frontend dependencies are missing.
  echo Run npm ci from the frontend directory first.
  exit /b 1
)

start "FYP Frontend" /D "%ROOT%frontend" cmd /k "npm run dev"
start "FYP Backend" /D "%ROOT%backend" cmd /k ".\venv\Scripts\python.exe -m uvicorn main:app"

echo Both frontend and backend are launching...
pause
endlocal
