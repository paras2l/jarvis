const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn, exec } = require('child_process')
const os = require('os')

const isDev = !app.isPackaged
let assistiveAutomationPermission = false

// ─────────────────────────────────────────────────────────────────────────────
// Window
// ─────────────────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173').catch(() => {
      const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
      if (fs.existsSync(indexPath)) win.loadFile(indexPath)
    })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sandboxedPath(filePath) {
  // All file I/O is restricted to a safe workspace under %APPDATA%
  const safeRoot = path.join(app.getPath('userData'), 'studio-workspace')
  fs.mkdirSync(safeRoot, { recursive: true })
  const resolved = path.resolve(safeRoot, filePath)
  if (!resolved.startsWith(safeRoot)) {
    throw new Error(`Path traversal blocked: ${filePath}`)
  }
  return resolved
}

function runPowerShellStart(filePath) {
  return new Promise((resolve) => {
    const escaped = String(filePath).replace(/'/g, "''")
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
       '-Command', `Start-Process -FilePath '${escaped}'`],
      { windowsHide: true }
    )
    let stderr = ''
    child.stderr.on('data', (c) => { stderr += c })
    child.on('close', (code) =>
      resolve(code === 0
        ? { success: true, message: `Launched ${filePath}` }
        : { success: false, message: stderr || `Failed: ${filePath}` })
    )
    child.on('error', (e) => resolve({ success: false, message: e.message }))
  })
}

function escapeForSendKeys(input) {
  return String(input).replace(/([+^%~(){}\[\]])/g, '{$1}')
}

async function openAppWithAssistiveAutomation(appInput) {
  const raw = String(appInput || '').trim()
  if (!raw) return { success: false, message: 'No app specified.' }

  if (process.platform !== 'win32') {
    return { success: false, message: 'Assistive automation is Windows-only.' }
  }

  const escapedForSendKeys = escapeForSendKeys(raw)
  const escapedForPowerShell = escapedForSendKeys.replace(/'/g, "''")

  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$wshell = New-Object -ComObject WScript.Shell',
    '$null = $wshell.AppActivate("Program Manager")',
    'Start-Sleep -Milliseconds 150',
    '$wshell.SendKeys("^{ESC}")',
    'Start-Sleep -Milliseconds 500',
    `$wshell.SendKeys('${escapedForPowerShell}')`,
    'Start-Sleep -Milliseconds 650',
    '$wshell.SendKeys("{ENTER}")',
  ].join('; ')

  return new Promise((resolve) => {
    const child = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }
    )
    let stderr = ''
    child.stderr.on('data', (c) => { stderr += c })
    child.on('close', (code) =>
      resolve(code === 0
        ? { success: true, message: `Assistive launch attempted for ${raw}.` }
        : { success: false, message: stderr || 'Assistive automation failed.' })
    )
    child.on('error', (e) => resolve({ success: false, message: e.message }))
  })
}

const APP_ALIASES = {
  notepad: 'notepad.exe', calculator: 'calc.exe', calc: 'calc.exe',
  cmd: 'cmd.exe', powershell: 'powershell.exe', vscode: 'code',
  chrome: 'chrome.exe', edge: 'msedge.exe', firefox: 'firefox.exe',
  spotify: 'spotify.exe', whatsapp: 'whatsapp.exe',
  telegram: 'telegram.exe', discord: 'discord.exe',
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC Handlers — App Launch
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('native:open-external', async (_ev, target) => {
  try {
    await shell.openExternal(String(target))
    return { success: true, message: `Opened ${target}` }
  } catch (e) {
    return { success: false, message: e.message }
  }
})

ipcMain.handle('native:launch-app', async (_ev, appInput) => {
  const raw = String(appInput || '').trim()
  if (!raw) return { success: false, message: 'No app specified.' }

  const mapped = APP_ALIASES[raw.toLowerCase()] || raw

  if (/^(https?:|mailto:|tel:|[a-z][a-z0-9+.-]*:\/\/)/i.test(mapped)) {
    try {
      await shell.openExternal(mapped)
      return { success: true, message: `Opened ${mapped}` }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  if (process.platform === 'win32') {
    const r = await runPowerShellStart(mapped)
    if (r.success) return r
    if (mapped !== raw) {
      const fallback = await runPowerShellStart(raw)
      if (fallback.success) return fallback
    }
  }

  return { success: false, message: `Could not launch ${raw}.` }
})

ipcMain.handle('native:get-automation-permission', async () => ({
  success: true, enabled: assistiveAutomationPermission,
  message: assistiveAutomationPermission ? 'Enabled.' : 'Disabled.',
}))

ipcMain.handle('native:set-automation-permission', (_ev, enabled) => {
  assistiveAutomationPermission = Boolean(enabled)
  return { success: true, enabled: assistiveAutomationPermission, message: 'Updated.' }
})

ipcMain.handle('native:open-app-assistive', async (_ev, appInput) => {
  if (!assistiveAutomationPermission) {
    return { success: false, message: 'Assistive automation disabled. Enable in Settings.' }
  }
  return openAppWithAssistiveAutomation(appInput)
})

// ─────────────────────────────────────────────────────────────────────────────
// IPC Handlers — Shell Commands (for Python AI workers)
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('native:run-command', async (_ev, command, opts = {}) => {
  const timeoutMs = opts.timeoutMs ?? 300_000 // 5 minutes default for AI inference
  const cwd = opts.cwd ?? app.getPath('userData')

  return new Promise((resolve) => {
    exec(command, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        resolve({
          success: false,
          output: stdout,
          error: stderr || err.message,
        })
      } else {
        resolve({ success: true, output: stdout, error: stderr })
      }
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// IPC Handlers — File I/O (for Python script management and artifact storage)
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('native:write-file', async (_ev, filePath, content) => {
  try {
    const safe = sandboxedPath(filePath)
    fs.mkdirSync(path.dirname(safe), { recursive: true })
    fs.writeFileSync(safe, content, 'utf8')
    return { success: true, resolvedPath: safe }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('native:read-file', async (_ev, filePath) => {
  try {
    const safe = sandboxedPath(filePath)
    const content = fs.readFileSync(safe, 'utf8')
    return { success: true, content }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('native:file-exists', async (_ev, filePath) => {
  try {
    const safe = sandboxedPath(filePath)
    return { exists: fs.existsSync(safe), resolvedPath: safe }
  } catch {
    return { exists: false }
  }
})

ipcMain.handle('native:get-workspace-path', async () => {
  const safeRoot = path.join(app.getPath('userData'), 'studio-workspace')
  fs.mkdirSync(safeRoot, { recursive: true })
  return { path: safeRoot }
})

ipcMain.handle('native:get-python-scripts-path', async () => {
  // Where diffusion_core.py and voice_core.py live
  const scriptDir = path.join(__dirname, '..', 'src', 'core', 'media-ml', 'python')
  return { path: scriptDir }
})

// ─────────────────────────────────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
