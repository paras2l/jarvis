@echo off
REM ============================================================================
REM Patrich Development Startup Script
REM Boots Vite dev server + Electron app automatically
REM ============================================================================

setlocal enabledelayedexpansion

REM Get directory where this script is located
cd /d "%~dp0"

echo.
echo ============================================================================
echo.
echo   PATRICH - Personal AI Agent
echo.
echo ============================================================================
echo.
echo Starting development environment...
echo.

REM Start Vite in a new window with its own console
echo [Step 1/2] Starting Vite dev server (localhost:5173)...
start "Vite Dev Server - Patrich" cmd /k "npm run dev"

REM Wait 7 seconds for Vite to fully start
echo [Step 2/2] Waiting for server to start...
timeout /t 7 /nobreak

REM Start Electron in current window
echo.
echo Starting Electron app...
echo.

npm run electron-dev

pause
