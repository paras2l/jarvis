const { app, BrowserWindow, ipcMain, shell, desktopCapturer } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const pdfParse = require('pdf-parse')

const isDev = !app.isPackaged
let assistiveAutomationPermission = false

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
      if (fs.existsSync(indexPath)) {
        win.loadFile(indexPath)
      }
    })
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    win.loadFile(indexPath)
  }
}

function runPowerShellStart(filePath) {
  return new Promise((resolve) => {
    const escaped = String(filePath).replace(/'/g, "''")
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Start-Process -FilePath '${escaped}'`,
      ],
      { windowsHide: true }
    )

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: `Launched ${filePath}` })
      } else {
        resolve({
          success: false,
          message: stderr || `Failed to start ${filePath}`,
        })
      }
    })

    child.on('error', (error) => {
      resolve({ success: false, message: error.message })
    })
  })
}

function runProcess(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      ...options,
    })

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: `Executed ${command}` })
      } else {
        resolve({
          success: false,
          message: stderr || `Failed to execute ${command}`,
        })
      }
    })

    child.on('error', (error) => {
      resolve({ success: false, message: error.message })
    })
  })
}

function runProcessGetOutput(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      ...options,
    })

    let stdout = ''
    let stderr = ''
    
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stdout: stdout.trim() })
      } else {
        resolve({
          success: false,
          message: stderr || `Failed to execute ${command}`,
        })
      }
    })

    child.on('error', (error) => {
      resolve({ success: false, message: error.message })
    })
  })
}

function runPowerShellScript(scriptBody) {
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        scriptBody,
      ],
      { windowsHide: true }
    )

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: 'Assistive automation command executed.' })
      } else {
        resolve({
          success: false,
          message: stderr || 'Assistive automation command failed.',
        })
      }
    })

    child.on('error', (error) => {
      resolve({ success: false, message: error.message })
    })
  })
}

function runPowerShellGetOutput(scriptBody) {
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        scriptBody,
      ],
      { windowsHide: true }
    )

    let stdout = ''
    let stderr = ''
    
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stdout: stdout.trim() })
      } else {
        resolve({
          success: false,
          message: stderr || 'Failed to get output.',
        })
      }
    })

    child.on('error', (error) => {
      resolve({ success: false, message: error.message })
    })
  })
}

function escapeForSingleQuotedPowerShell(input) {
  return String(input).replace(/'/g, "''")
}

function escapeForSendKeys(input) {
  return String(input)
    .replace(/([+^%~(){}[\]])/g, '{$1}')
}

async function openAppWithAssistiveAutomation(appInput) {
  const raw = String(appInput || '').trim()
  if (!raw) {
    return { success: false, message: 'No app specified for assistive mode.' }
  }

  if (process.platform === 'darwin') {
    const script = `tell application "System Events" to keystroke space using {command down}; delay 0.4; tell application "System Events" to keystroke "${raw.replace(/"/g, '\\"')}"; delay 0.5; tell application "System Events" to key code 36`
    const result = await runProcess('osascript', ['-e', script])
    return result.success
      ? {
          success: true,
          message: `Assistive mode attempted to open ${raw} via Spotlight.`,
        }
      : result
  }

  if (process.platform === 'linux') {
    const result = await runProcess('sh', ['-lc', `command -v xdotool >/dev/null 2>&1 && xdotool key super && sleep 0.4 && xdotool type --delay 35 "${raw.replace(/"/g, '\\"')}" && sleep 0.4 && xdotool key Return`])
    return result.success
      ? {
          success: true,
          message: `Assistive mode attempted to open ${raw} via launcher search.`,
        }
      : {
          success: false,
          message: 'Linux assistive automation requires xdotool and desktop launcher support.',
        }
  }

  if (process.platform !== 'win32') {
    return {
      success: false,
      message: 'Assistive automation is not available on this platform.',
    }
  }

  const escapedForSendKeys = escapeForSendKeys(raw)
  const escapedForPowerShell = escapeForSingleQuotedPowerShell(escapedForSendKeys)

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

  const runResult = await runPowerShellScript(script)
  if (!runResult.success) {
    return runResult
  }

  return {
    success: true,
    message: `Assistive mode attempted to open ${raw} via Start menu search.`,
  }
}

const appAliases = {
  notepad: 'notepad.exe',
  calculator: 'calc.exe',
  calc: 'calc.exe',
  cmd: 'cmd.exe',
  powershell: 'powershell.exe',
  vscode: 'code',
  chrome: 'chrome.exe',
  edge: 'msedge.exe',
  firefox: 'firefox.exe',
  spotify: 'spotify.exe',
  whatsapp: 'whatsapp.exe',
  telegram: 'telegram.exe',
  discord: 'discord.exe',
}

// Expose PDF Reading locally and remotely
ipcMain.handle('read-pdf', async (event, filePath) => {
  try {
    let dataBuffer;
    
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      // Remote PDF fetching directly into memory buffer
      console.log(`[IPC] Fetching remote PDF: ${filePath}`);
      const response = await fetch(filePath);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      dataBuffer = Buffer.from(arrayBuffer);
    } else {
      // Local PDF checking
      if (!fs.existsSync(filePath)) {
        return { success: false, message: `File not found: ${filePath}` }
      }
      dataBuffer = fs.readFileSync(filePath);
    }

    const data = await pdfParse(dataBuffer);
    return { success: true, text: data.text }
  } catch (error) {
    console.error('Error reading PDF:', error)
    return { success: false, message: error.message }
  }
})

// ─── Skill Profile Disk Persistence ──────────────────────────────────────────
// Stores learned app profiles as JSON in <userData>/skills/
const SKILLS_DIR = path.join(app.getPath('userData'), 'skills')
if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true })

ipcMain.handle('native:save-skill', async (_event, { appName, profile }) => {
  try {
    const filePath = path.join(SKILLS_DIR, `${appName.toLowerCase()}.json`)
    fs.writeFileSync(filePath, JSON.stringify(profile, null, 2))
    console.log(`[IPC] Skill saved: ${filePath}`)
    return { success: true }
  } catch (err) {
    console.error('[IPC] save-skill error:', err)
    return { success: false, message: String(err) }
  }
})

ipcMain.handle('native:load-skill', async (_event, { appName }) => {
  try {
    const filePath = path.join(SKILLS_DIR, `${appName.toLowerCase()}.json`)
    if (!fs.existsSync(filePath)) return { success: false, message: 'Not found' }
    const raw = fs.readFileSync(filePath, 'utf-8')
    return { success: true, profile: JSON.parse(raw) }
  } catch (err) {
    console.error('[IPC] load-skill error:', err)
    return { success: false, message: String(err) }
  }
})

ipcMain.handle('native:list-skills', async () => {
  try {
    const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.json'))
    return { success: true, skills: files.map(f => f.replace('.json', '')) }
  } catch (err) {
    return { success: false, skills: [], message: String(err) }
  }
})

// ─── Self-Coding Engine IPC Handlers ─────────────────────────────────────────

ipcMain.handle('native:write-file', async (_event, { filePath, content }) => {
  try {
    // Ensure parent directory exists
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
    console.log(`[IPC] File written: ${filePath}`)
    return { success: true }
  } catch (err) {
    console.error('[IPC] write-file error:', err)
    return { success: false, message: String(err) }
  }
})

ipcMain.handle('native:read-file', async (_event, { filePath }) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, message: 'File not found' }
    const content = fs.readFileSync(filePath, 'utf-8')
    return { success: true, content }
  } catch (err) {
    console.error('[IPC] read-file error:', err)
    return { success: false, message: String(err) }
  }
})

ipcMain.handle('native:run-shell-command', async (_event, { command, cwd }) => {
  return new Promise((resolve) => {
    const workDir = cwd || app.getPath('home')
    console.log(`[IPC] Shell: $ ${command} (cwd: ${workDir})`)
    
    const proc = spawn('cmd.exe', ['/c', command], {
      cwd: workDir,
      shell: false,
      timeout: 60000,
    })
    
    let output = ''
    let errorOutput = ''
    
    proc.stdout?.on('data', (data) => { output += data.toString() })
    proc.stderr?.on('data', (data) => { errorOutput += data.toString() })
    
    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        output: output.trim(),
        error: errorOutput.trim(),
        exitCode: code,
        message: code === 0 ? 'Command succeeded' : `Exit code ${code}`,
      })
    })
    
    proc.on('error', (err) => {
      resolve({ success: false, output: '', message: String(err) })
    })
  })
})

// Humanoid Automation IPC Handlers
ipcMain.handle('native:mouse-move', async (_event, { x, y }) => {
  if (process.platform !== 'win32') return { success: false, message: 'Platform not supported' }
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})
  `
  return runPowerShellScript(script)
})

ipcMain.handle('native:mouse-click', async (_event, button = 'left') => {
  if (process.platform !== 'win32') return { success: false, message: 'Platform not supported' }
  // Define mouse_event using user32.dll
  const script = `
    $signature = @'
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
'@
    $type = Add-Type -MemberDefinition $signature -Name "Win32MouseEvent" -Namespace "Win32" -PassThru
    $MOUSEEVENTF_LEFTDOWN = 0x0002
    $MOUSEEVENTF_LEFTUP = 0x0004
    $MOUSEEVENTF_RIGHTDOWN = 0x0008
    $MOUSEEVENTF_RIGHTUP = 0x0010
    
    if ("${button}" -eq "left") {
      $type::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
      Start-Sleep -Milliseconds 50
      $type::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    } else {
      $type::mouse_event($MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
      Start-Sleep -Milliseconds 50
      $type::mouse_event($MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
    }
  `
  return runPowerShellScript(script)
})

ipcMain.handle('native:keyboard-type', async (_event, text) => {
  if (process.platform !== 'win32') return { success: false, message: 'Platform not supported' }
  const escapedText = escapeForSendKeys(text)
  const escapedForPS = escapeForSingleQuotedPowerShell(escapedText)
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait('${escapedForPS}')
  `
  return runPowerShellScript(script)
})

ipcMain.handle('native:open-external', async (_event, target) => {
  try {
    await shell.openExternal(String(target))
    return { success: true, message: `Opened ${target}` }
  } catch (error) {
    return { success: false, message: error.message }
  }
})

ipcMain.handle('native:launch-app', async (_event, appInput) => {
  const raw = String(appInput || '').trim()
  if (!raw) {
    return { success: false, message: 'No app specified.' }
  }

  const mapped = appAliases[raw.toLowerCase()] || raw

  if (/^(https?:|mailto:|tel:|sms:|[a-z][a-z0-9+.-]*:\/\/)/i.test(mapped)) {
    try {
      await shell.openExternal(mapped)
      return { success: true, message: `Opened ${mapped}` }
    } catch (error) {
      return { success: false, message: error.message }
    }
  }

  if (process.platform === 'win32') {
    const startResult = await runPowerShellStart(mapped)
    if (startResult.success) {
      return startResult
    }

    if (mapped !== raw) {
      const fallback = await runPowerShellStart(raw)
      if (fallback.success) {
        return fallback
      }
    }
  }

  if (process.platform === 'darwin') {
    const appOpen = await runProcess('open', ['-a', mapped])
    if (appOpen.success) {
      return { success: true, message: `Launched ${mapped}` }
    }
    const fallback = await runProcess('open', [mapped])
    if (fallback.success) {
      return { success: true, message: `Opened ${mapped}` }
    }
  }

  if (process.platform === 'linux') {
    const direct = await runProcess(mapped, [])
    if (direct.success) {
      return { success: true, message: `Launched ${mapped}` }
    }

    const xdg = await runProcess('xdg-open', [mapped])
    if (xdg.success) {
      return { success: true, message: `Opened ${mapped}` }
    }
  }

  return {
    success: false,
    message:
      `Could not launch ${raw}. Try full executable path or install/register the app.`,
  }
})

ipcMain.handle('native:get-automation-permission', async () => {
  return {
    success: true,
    enabled: assistiveAutomationPermission,
    message: assistiveAutomationPermission
      ? 'Assistive automation is enabled.'
      : 'Assistive automation is disabled.',
  }
})

ipcMain.handle('native:set-automation-permission', async (_event, enabled) => {
  assistiveAutomationPermission = Boolean(enabled)
  return {
    success: true,
    enabled: assistiveAutomationPermission,
    message: assistiveAutomationPermission
      ? 'Assistive automation permission granted.'
      : 'Assistive automation permission revoked.',
  }
})

ipcMain.handle('native:open-app-assistive', async (_event, appInput) => {
  if (!assistiveAutomationPermission) {
    return {
      success: false,
      message: 'Assistive automation is disabled. Enable permission first.',
    }
  }

  return openAppWithAssistiveAutomation(appInput)
})

ipcMain.handle('native:get-screen-source-id', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    if (sources && sources.length > 0) {
      return { success: true, sourceId: sources[0].id }
    }
    return { success: false, message: 'No screen sources found.' }
  } catch (error) {
    return { success: false, message: `Failed to get screen source: ${error.message}` }
  }
})

ipcMain.handle('native:get-foreground-window', async () => {
  if (process.platform === 'darwin') {
    const appleScript = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set frontAppName to name of frontApp
        try
          set windowTitle to name of front window of frontApp
          return frontAppName & " " & windowTitle
        on error
          return frontAppName
        end try
      end tell
    `
    return runProcessGetOutput('osascript', ['-e', appleScript]).then(res => {
      if (!res.success) return res;
      return { success: true, windowTitle: res.stdout }
    })
  }

  if (process.platform === 'linux') {
    return runProcessGetOutput('xdotool', ['getactivewindow', 'getwindowname']).then(res => {
      if (!res.success) return { success: false, message: 'xdotool required for linux foreground detection.' }
      return { success: true, windowTitle: res.stdout }
    }).catch(() => {
      return { success: false, message: 'xdotool required for linux foreground detection.' }
    })
  }

  if (process.platform === 'win32') {
    const script = `
      $signature = @'
      using System;
      using System.Runtime.InteropServices;
      using System.Text;
      public class NativeMethods {
        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
      }
  '@
      Add-Type -TypeDefinition $signature -Name "Win32Native" -Namespace "Win32" -ErrorAction SilentlyContinue
      $hwnd = [Win32.Win32Native]::GetForegroundWindow()
      $sb = New-Object System.Text.StringBuilder 256
      $null = [Win32.Win32Native]::GetWindowText($hwnd, $sb, $sb.Capacity)
      $sb.ToString()
    `
    return runPowerShellGetOutput(script).then(res => {
      if (!res.success) return res;
      return { success: true, windowTitle: res.stdout }
    })
  }

  return { success: false, message: 'Platform not supported for foreground window detection.' }
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
