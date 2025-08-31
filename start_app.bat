@echo off
echo Starting FYP system...

REM --- Start frontend ---
start cmd /k "cd frontend && npm run dev"

REM --- Start backend ---
start cmd /k "cd backend && call .\venv\Scripts\activate && uvicorn main:app --reload"

echo Both frontend and backend are launching...
pause
