@echo off
cd /d "d:\Antigravity\test-model"
echo Restoring electron and public directories...
git checkout 7d13e9be98502f860ec4ffd43c2f7aa95df393ea -- electron/ public/
echo.
echo electron/ contents:
dir electron /b
echo.
echo public/ contents:
dir public /b
echo.
echo Restoration complete!
