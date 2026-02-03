@echo off
echo Stopping backend server...
taskkill /F /IM python.exe /FI "WINDOWTITLE eq *uvicorn*" 2>nul

echo Waiting for process to stop...
timeout /t 2 /nobreak >nul

echo Deleting database files...
del /F /Q econova.db 2>nul
del /F /Q econova_v2.db 2>nul

echo Database files deleted!
echo.
echo Please restart the backend server manually with:
echo   cd backend
echo   venv\Scripts\activate
echo   cd ..
echo   uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
echo.
echo Or just run: npm run dev (from frontend folder)
pause
