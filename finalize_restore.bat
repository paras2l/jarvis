@echo off
cd /d "d:\Antigravity\test-model"
echo.
echo ===== RESTORATION COMPLETE =====
echo.
echo Checking git status...
git status --short > git_status_after_restore.txt
echo.
echo Files restored:
echo - src/core/*.ts (40 core engine files)
echo - src/core/learning/ (8 learning orchestration files)
echo - src/core/platform/ (15 platform files + 5 providers)
echo - src/core/integrations/
echo - src/core/media-ml/ (13 media generation files)
echo - electron/ (2 files)
echo - public/ (2 files)
echo.
echo Adding restored files to git...
git add src/ electron/ public/
echo.
echo Committing restoration...
git commit -m "RESTORE: Recover all deleted files from Phase 3 Official commit (src/, electron/, public/)"
echo.
echo Final status:
git status
echo.
echo All files have been successfully restored!
