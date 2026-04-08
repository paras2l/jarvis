# Patrich Electron App - Complete Setup Guide

## ✅ Current Status
Your app has been **successfully configured and built**:
- ✅ npm dependencies installed
- ✅ TypeScript compiled without errors
- ✅ Vite build optimized
- ✅ Electron configured (no white screen)
- ✅ Ready for production

---

## 🚀 Quick Start

### Option 1: Use the Startup Script (RECOMMENDED)
Simply double-click:
```
START_DEV.bat
```

This automatically:
1. Kills any existing processes
2. Launches Vite dev server (localhost:5173)
3. Launches Electron app

### Option 2: Manual Two-Terminal Approach

**Terminal 1 - Start Vite Dev Server:**
```bash
cd d:\Antigravity\patrich\jarvis
npm run dev
```
Wait for: `➜  Local:   http://localhost:5173/`

**Terminal 2 - Start Electron:**
```bash
cd d:\Antigravity\patrich\jarvis
npm run electron-dev
```

---

## 📦 Build for Distribution

### Build Windows Portable Executable
```bash
npm run electron-build
```

Output location: `dist/Patrich-portable-1.0.0.exe`

### Build with Installer
```bash
npm run electron-build
```

---

## 🔧 Development Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | TypeScript compile + Vite optimize |
| `npm run electron-dev` | Run Electron with dev server |
| `npm run electron-build` | Build distributable .exe |
| `npm run type-check` | Check TypeScript errors |
| `npm run lint` | Check code style |

---

## 🎯 Key Files & Their Purpose

### Application Entry Points
- **`src/main.tsx`** - React root component, initializes app
- **`src/App.tsx`** - Main UI component
- **`index.html`** - HTML template Vite uses
- **`electron/main.cjs`** - Electron main process (window creation, IPC handlers)
- **`electron/preload.cjs`** - Security bridge between Electron and React

### Configuration
- **`vite.config.ts`** - Vite build settings & aliases
- **`tsconfig.json`** - TypeScript compilation settings
- **`package.json`** - Dependencies & scripts

### Assets
- **`public/`** - Static files (manifest.json, service worker)
- **`src/components/`** - React components
- **`src/core/`** - Business logic (agents, engines, protocols)
- **`src/styles/`** - CSS stylesheets

---

## 🐛 Troubleshooting

### White Screen / Blank Window
**Problem:** Electron window shows blank/white screen
**Solution:** Make sure **Vite dev server is running** before Electron starts
```bash
# Terminal 1
npm run dev    # Start this FIRST

# Terminal 2 (wait 5 seconds, then)
npm run electron-dev
```

### Port 5173 Already in Use
```bash
# Find process using port 5173
netstat -ano | findstr :5173

# Kill it (replace PID with the number from above)
taskkill /PID <PID> /F
```

### Module Not Found Errors
```bash
# Clean install
npm cache clean --force
rmdir /s /q node_modules
del package-lock.json
npm install
```

---

## 📊 Architecture

```
┌─────────────────┐
│  Electron Main  │ (electron/main.cjs)
│  - Window mgmt  │
│  - IPC handlers │
│  - File I/O     │
└────────┬────────┘
         │ IPC Bridge
         ▼
┌─────────────────┐     ┌─────────────────┐
│  React App      │────▶│  Vite Dev Server│
│  (src/App.tsx)  │     │  (localhost:5173)
└─────────────────┘     └─────────────────┘
         ▲
         │ Preload Script
         ▼
    Native APIs
  (File, Shell, etc)
```

---

## 🔐 Security Notes

- ✅ Context isolation enabled
- ✅ Node integration disabled
- ✅ Preload script validates all IPC calls
- ✅ File I/O sandboxed to `%APPDATA%/Patrich`

---

## 📝 No More Configuration Needed!

Everything is set up. You can now:
1. **Develop**: Use `npm run dev` + `npm run electron-dev`
2. **Build**: Use `npm run electron-build` for .exe
3. **Deploy**: Distribute the .exe file

---

## 💾 Commit These Changes

```bash
git add .
git commit -m "feat: Fix TypeScript build errors and configure Electron properly"
git push
```

---

**Status**: Production Ready ✅
