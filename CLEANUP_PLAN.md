# Cleanup & Fresh Clone Plan

## Step 1: Add exe to gitignore (DONE)
```powershell
cd d:\Antigravity\test-model
echo "*.exe" >> .gitignore
git add .gitignore
git commit -m "chore: ignore exe files and large onnx models"
```

## Step 2: Push to GitHub
```powershell
git push origin main
```

## Step 3: Copy the kokoro file BEFORE deleting the folder
```powershell
# Save it somewhere safe first!
cp src/core/media-ml/python/kokoro-v0_19.onnx "C:\Users\paras\Desktop\kokoro-backup.onnx"
```

## Step 4: Delete the entire folder
```powershell
cd ..
Remove-Item -Recurse -Force test-model
```

## Step 5: Clone fresh in VS Code
1. Open VS Code
2. File → Open Folder
3. Select where to clone: `d:\Antigravity\`
4. Clone: `https://github.com/paras2l/jarvis.git`
5. Rename it back to `test-model` if needed

Done! Fresh repo without build artifacts and locked files.
