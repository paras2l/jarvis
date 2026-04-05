@echo off
cd /d "d:\Antigravity\test-model"
echo Starting file restoration...
git checkout 7d13e9be98502f860ec4ffd43c2f7aa95df393ea -- src/
echo Restoration completed
echo.
echo Files in src/core:
dir src\core /b
pause
