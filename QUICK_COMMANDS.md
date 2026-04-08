# Quick Reference - Copy & Paste Commands

## 🚀 START DEVELOPING (Choose One)

### Option A: Easy Mode (Recommended for Windows PC)
Just double-click this file in File Explorer:
```
RUN_APP.bat
```

### Option B: Command Line (2 Terminals)
Terminal 1:
```bash
cd d:\Antigravity\patrich\jarvis && npm run dev
```

Terminal 2 (wait 5 seconds after Terminal 1 starts):
```bash
cd d:\Antigravity\patrich\jarvis && npm run electron-dev
```

---

## 📦 BUILD PRODUCTION EXE

Option A: Easy Mode
```
BUILD_PRODUCTION.bat
```

Option B: Command Line
```bash
cd d:\Antigravity\patrich\jarvis
npm run build
npm run electron-build
```

Output: `dist/Patrich-portable-1.0.0.exe`

---

## 🧹 CLEAN REBUILD (If Something Breaks)

```bash
cd d:\Antigravity\patrich\jarvis
npm cache clean --force
rmdir /s /q node_modules
del package-lock.json
npm install
npm run build
```

---

## ✅ VERIFY BUILD

```bash
cd d:\Antigravity\patrich\jarvis
npm run type-check
npm run lint
npm run build
```

---

## 📂 FILE LOCATIONS

- **Source code**: `src/` folder
- **Build output**: `dist/` folder  
- **Executable**: `dist/Patrich-portable-1.0.0.exe`
- **Config**: `package.json`, `vite.config.ts`, `tsconfig.json`

---

## 🎯 FIRST TIME SETUP (Already Done!)

If you need to redo everything:
```bash
cd d:\Antigravity\patrich\jarvis
npm cache clean --force
npm install
npm run build
```

Then use `RUN_APP.bat` to test

---

## 🆘 TROUBLESHOOTING COMMANDS

Kill stuck processes:
```bash
taskkill /im node.exe /f
taskkill /im electron.exe /f
```

Check if port is in use:
```bash
netstat -ano | findstr :5173
netstat -ano | findstr :3000
```

View npm cache:
```bash
npm cache verify
```

Check installed packages:
```bash
npm list
```

---

## 📝 GIT COMMANDS

Save progress:
```bash
git add .
git commit -m "your message here"
git push
```

Check status:
```bash
git status
git log --oneline -5
```

---

That's it! 🎉
