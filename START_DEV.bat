@echo off
REM ============================================================================
REM Pixi Development Server Startup Script
REM START_DEV.bat - Boots both Vite and Electron for development
REM ============================================================================

setlocal enabledelayedexpansion

REM Check if already running
tasklist | find /i "npm" > nul
if %errorlevel% equ 0 (
    echo.
    echo [INFO] npm processes already running. Killing them...
    taskkill /im npm.exe /fi "status eq running" /f 2>nul
    timeout /t 2 /nobreak
)

REM Get the directory of this script
cd /d "%~dp0"

echo.
echo ============================================================================
echo Pixi Development Server
echo ============================================================================
echo.
echo [1/2] Starting Vite development server on http://localhost:5173...
echo.

REM Start Vite in a new window
start "Vite Dev Server" cmd /k npm run dev

REM Wait for Vite to start
timeout /t 5 /nobreak

echo.
echo [2/2] Starting Electron application...
echo.

REM Start Electron
npm run electron-dev

REM If Electron closes, keep showing output
pause

