@echo off
REM ============================================================================
REM Patrich Production Build Script
REM Creates distributable Windows .exe file
REM ============================================================================

setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo ============================================================================
echo   Building Patrich for Distribution...
echo ============================================================================
echo.
echo This will create: Patrich-portable-1.0.0.exe
echo Location: dist/ folder
echo.

echo [1/3] Cleaning...
rmdir /s /q dist 2>nul
rmdir /s /q out 2>nul
echo [OK]

echo [2/3] Building Vite app...
npm run build
if errorlevel 1 (
    echo [ERROR] Vite build failed!
    pause
    exit /b 1
)
echo [OK]

echo [3/3] Building Electron installer...
npm run electron-build
if errorlevel 1 (
    echo [ERROR] Electron build failed!
    pause
    exit /b 1
)
echo [OK]

echo.
echo ============================================================================
echo BUILD COMPLETE!
echo ============================================================================
echo.
echo Your executable is ready at:
echo   dist\Patrich-portable-1.0.0.exe
echo.
echo You can now:
echo 1. Test the executable
echo 2. Distribute it to users
echo 3. Or continue developing with npm run dev + npm run electron-dev
echo.
pause
