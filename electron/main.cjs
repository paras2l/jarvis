const { app, BrowserWindow, ipcMain, shell, desktopCapturer, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn, exec } = require('child_process')
const os = require('os')
const { createWorker } = require('tesseract.js')

const isDev = !app.isPackaged
let assistiveAutomationPermission = false
const authSessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
let mainWindow = null
let appQuitting = false
let browserAgentWindow = null
let ocrWorkerPromise = null
const channelConnections = new Map()

const assistantServiceState = {
  enabled: true,
  wakeWord: 'hey patrich',
  listening: false,
  activatedUntilMs: 0,
  recognizerProcess: null,
  provider: String(process.env.VOICE_PROVIDER || 'local_whisper').toLowerCase(),
  whisperModel: String(process.env.WHISPER_MODEL || 'base').toLowerCase(),
  whisperDevice: String(process.env.WHISPER_DEVICE || 'cpu').toLowerCase(),
}

function broadcastAssistantEvent(event) {
  const payload = { timestamp: Date.now(), ...event }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('assistant:event', payload)
  }
}

function logAssistant(message) {
  writeMainLog(`[assistant] ${message}`)
}

function broadcastChannelMessage(channelId, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('channel:message', { channelId, data })
  }
}

function extractAppFromCommand(command) {
  const text = String(command || '').trim()
  const match = text.match(/^(?:open|launch|start)\s+(.+)$/i)
  if (!match) return ''
  return match[1]
    .replace(/^(the|my)\s+/i, '')
    .replace(/[.!?]+$/g, '')
    .trim()
}

function speakText(text) {
  const phrase = String(text || '').trim()
  if (!phrase || process.platform !== 'win32') return

  const escaped = phrase.replace(/'/g, "''")
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$s.Rate = 0',
    `$s.Speak('${escaped}')`,
  ].join('; ')

  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true }
  )
  child.on('error', (e) => logAssistant(`tts error: ${e.message}`))
}

function containsWakePhrase(lowerText) {
  return /(?:^|\b)(?:hey|ok|okay)\s+(?:patrich|patrick|patric|jarvis)\b|(?:^|\b)(?:patrich|patrick|patric|jarvis)\b/i.test(lowerText)
}

function stripWakePhrase(text) {
  return String(text || '').replace(/^(?:hey\s+(?:patrich|patrick|patric|jarvis)|(?:ok|okay)\s+(?:patrich|patrick|patric|jarvis)|(?:patrich|patrick|patric|jarvis))[\s,:-]*/i, '').trim()
}

async function routeAssistantCommand(commandText) {
  const command = String(commandText || '').trim()
  if (!command) {
    speakText('I am listening.')
    return
  }

  logAssistant(`command: ${command}`)
  broadcastAssistantEvent({ type: 'command', command })

  const appName = extractAppFromCommand(command)
  if (appName) {
    const result = await handleNativeLaunchApp(appName)
    if (result.success) {
      speakText(`Done. Opened ${appName}.`)
    } else {
      speakText(`I could not open ${appName}. ${result.message || ''}`.trim())
    }
    return
  }

  const closeMatch = command.match(/^(?:close|quit|exit|stop)\s+(.+)$/i)
  if (closeMatch) {
    const appToClose = closeMatch[1].trim()
    const processName = appToClose.replace(/\.(exe|app)$/i, '')
    const closeCmd =
      process.platform === 'win32'
        ? `taskkill /IM "${processName.endsWith('.exe') ? processName : `${processName}.exe`}" /F`
        : `pkill -f "${processName}"`
    const closeResult = await new Promise((resolve) => {
      exec(closeCmd, (err) => {
        if (err) resolve({ success: false, message: err.message })
        else resolve({ success: true, message: '' })
      })
    })
    speakText(closeResult.success ? `Closed ${appToClose}.` : `I could not close ${appToClose}.`)
    return
  }

  const searchMatch = command.match(/^(?:search|google|find)\s+(.+)$/i)
  if (searchMatch) {
    const query = searchMatch[1].trim()
    await shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(query)}`)
    speakText(`Searching for ${query}.`)
    return
  }

  const systemOp = command.match(/\b(volume\s+up|volume\s+down|mute|unmute|lock\s+screen)\b/i)
  if (systemOp) {
    const op = systemOp[1].toLowerCase()
    if (op === 'lock screen') {
      const lockCmd =
        process.platform === 'win32'
          ? 'rundll32.exe user32.dll,LockWorkStation'
          : process.platform === 'darwin'
          ? '/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend'
          : 'xdg-screensaver lock || loginctl lock-session'
      exec(lockCmd, () => {})
      speakText('Locking screen.')
      return
    }
    const key = op === 'mute' || op === 'unmute' ? '{VOLUME_MUTE}' : op === 'volume up' ? '{VOLUME_UP}' : '{VOLUME_DOWN}'
    await runPowerShellCommand(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${key}')`)
    speakText(`Done. ${op}.`)
    return
  }

  if (/\b(snapshot|capture\s+screen)\b/i.test(command)) {
    const snap = await (async () => {
      try {
        const primary = screen.getPrimaryDisplay()
        const source = (await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: primary.size.width, height: primary.size.height },
        }))[0]
        return source && !source.thumbnail.isEmpty()
      } catch {
        return false
      }
    })()
    speakText(snap ? 'Snapshot captured for automation context.' : 'I could not capture the screen.')
    return
  }

  if (/^(silent\s*mode|be\s*silent)$/i.test(command)) {
    speakText('Silent mode enabled in background assistant.')
    return
  }

  speakText('I heard your command, but that action is not configured yet.')
}

function handleRecognizerLine(line) {
  const textLine = String(line || '').trim()
  if (!textLine || !textLine.startsWith('TEXT|')) return

  const parts = textLine.split('|')
  if (parts.length < 3) return

  const confidence = Number(parts[1])
  const transcript = parts.slice(2).join('|').trim()
  if (!transcript) return

  broadcastAssistantEvent({ type: 'transcript', transcript, confidence })

  const lower = transcript.toLowerCase()
  if (containsWakePhrase(lower)) {
    const commandAfterWake = stripWakePhrase(transcript)
    assistantServiceState.activatedUntilMs = Date.now() + 12000
    speakText('Yes?')

    if (commandAfterWake) {
      routeAssistantCommand(commandAfterWake).catch((e) => logAssistant(`route error: ${e.message}`))
    }
    return
  }

  if (Date.now() <= assistantServiceState.activatedUntilMs) {
    routeAssistantCommand(transcript).catch((e) => logAssistant(`route error: ${e.message}`))
    assistantServiceState.activatedUntilMs = 0
  }
}

function buildWindowsRecognizerScript() {
  return [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Speech',
    '$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine',
    '$engine.SetInputToDefaultAudioDevice()',
    '$grammar = New-Object System.Speech.Recognition.DictationGrammar',
    '$engine.LoadGrammar($grammar)',
    'Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -Action {',
    '  param($sender, $eventArgs)',
    '  $text = $eventArgs.Result.Text',
    '  $confidence = [Math]::Round($eventArgs.Result.Confidence, 3)',
    '  if ($text) { Write-Output ("TEXT|{0}|{1}" -f $confidence, $text) }',
    '} | Out-Null',
    '$engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)',
    'while ($true) { Start-Sleep -Seconds 1 }',
  ].join('; ')
}

function normalizeWhisperModel(model) {
  const value = String(model || '').toLowerCase()
  if (value === 'tiny' || value === 'small') return value
  return 'base'
}

function normalizeWhisperDevice(device) {
  return String(device || '').toLowerCase() === 'gpu' ? 'gpu' : 'cpu'
}

function startBackgroundAssistantService() {
  if (!assistantServiceState.enabled) return
  if (assistantServiceState.recognizerProcess) return

  const provider = String(assistantServiceState.provider || process.env.VOICE_PROVIDER || 'local_whisper').toLowerCase()
  let child

  if (process.platform === 'win32') {
    const script = buildWindowsRecognizerScript()
    child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }
    )
  } else {
    logAssistant(`assistant speech service is unavailable on ${process.platform}; renderer voice runtime will handle recognition (${provider}).`)
    return
  }

  assistantServiceState.recognizerProcess = child
  assistantServiceState.listening = true
  logAssistant(`background recognizer started (${provider})`)
  broadcastAssistantEvent({ type: 'status', listening: true, enabled: true })

  child.stdout.on('data', (buf) => {
    const lines = String(buf)
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
    for (const line of lines) {
      handleRecognizerLine(line)
    }
  })

  child.stderr.on('data', (buf) => {
    logAssistant(`recognizer stderr: ${String(buf).trim()}`)
  })

  child.on('close', () => {
    assistantServiceState.recognizerProcess = null
    assistantServiceState.listening = false
    broadcastAssistantEvent({ type: 'status', listening: false, enabled: assistantServiceState.enabled })
    logAssistant('background recognizer stopped')

    if (!appQuitting && assistantServiceState.enabled) {
      setTimeout(() => startBackgroundAssistantService(), 1500)
    }
  })

  child.on('error', (e) => {
    logAssistant(`recognizer failed: ${e.message}`)
  })
}

function stopBackgroundAssistantService() {
  assistantServiceState.enabled = false
  assistantServiceState.activatedUntilMs = 0
  const child = assistantServiceState.recognizerProcess
  assistantServiceState.recognizerProcess = null
  assistantServiceState.listening = false

  if (child) {
    child.kill()
  }

  broadcastAssistantEvent({ type: 'status', listening: false, enabled: false })
  logAssistant('background recognizer disabled')
}

function writeMainLog(message) {
  try {
    const logsDir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(logsDir, { recursive: true })
    const logPath = path.join(logsDir, 'main.log')
    const line = `[${new Date().toISOString()}] ${message}\n`
    fs.appendFileSync(logPath, line, 'utf8')
  } catch {
    // Swallow logging failures to keep startup resilient.
  }
}

async function getOCRWorker() {
  if (ocrWorkerPromise) return ocrWorkerPromise

  ocrWorkerPromise = (async () => {
    const worker = await createWorker('eng')
    return worker
  })()

  return ocrWorkerPromise
}

function mapOCRWords(words = []) {
  return words
    .filter((w) => w && typeof w.text === 'string')
    .map((w) => ({
      text: w.text,
      confidence: Number(w.confidence || 0),
      bbox: {
        x: Number(w.bbox?.x0 || 0),
        y: Number(w.bbox?.y0 || 0),
        width: Math.max(0, Number((w.bbox?.x1 || 0) - (w.bbox?.x0 || 0))),
        height: Math.max(0, Number((w.bbox?.y1 || 0) - (w.bbox?.y0 || 0))),
      },
    }))
}

function runPowerShellCommand(script) {
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => {
      stdout += String(c)
    })
    child.stderr.on('data', (c) => {
      stderr += String(c)
    })
    child.on('close', (code) => {
      resolve({ success: code === 0, stdout: stdout.trim(), stderr: stderr.trim() })
    })
    child.on('error', (error) => {
      resolve({ success: false, stdout: '', stderr: error.message })
    })
  })
}

async function ensureBrowserAgentWindow(headless = true) {
  if (browserAgentWindow && !browserAgentWindow.isDestroyed()) {
    return browserAgentWindow
  }

  browserAgentWindow = new BrowserWindow({
    show: !headless,
    width: 1280,
    height: 820,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  browserAgentWindow.on('closed', () => {
    browserAgentWindow = null
  })

  await browserAgentWindow.loadURL('about:blank')
  return browserAgentWindow
}

function cssEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function setStartupBehavior() {
  if (process.platform !== 'win32') return
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
    args: ['--background'],
  })
}

function launchedInBackground() {
  const login = app.getLoginItemSettings()
  return Boolean(login.wasOpenedAtLogin || process.argv.includes('--background'))
}

process.on('uncaughtException', (error) => {
  writeMainLog(`uncaughtException: ${error && error.stack ? error.stack : String(error)}`)
})

process.on('unhandledRejection', (reason) => {
  writeMainLog(`unhandledRejection: ${reason && reason.stack ? reason.stack : String(reason)}`)
})

function showStartupError(win, reason) {
  const escapedReason = String(reason)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Patrich Startup Error</title>
    <style>
      body { font-family: Segoe UI, Arial, sans-serif; margin: 0; background: #0e1117; color: #e6edf3; }
      .wrap { max-width: 860px; margin: 64px auto; padding: 24px; }
      .card { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 18px; }
      h1 { margin: 0 0 12px; font-size: 22px; }
      p { margin: 0 0 10px; line-height: 1.5; }
      code { display: block; white-space: pre-wrap; word-break: break-word; background: #0d1117; border: 1px solid #30363d; padding: 10px; border-radius: 8px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Patrich could not load the app UI</h1>
        <p>Startup failed instead of showing a blank white screen.</p>
        <p>Please share this reason and the log file from userData/logs/main.log.</p>
        <code>${escapedReason}</code>
      </div>
    </div>
  </body>
</html>`

  win.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`).catch(() => {})
}

function resolveRendererIndexPath() {
  const primary = path.join(__dirname, '..', 'dist', 'index.html')
  if (fs.existsSync(primary)) return primary

  const fallback = path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html')
  if (fs.existsSync(fallback)) return fallback

  return null
}

async function loadDevRenderer(win) {
  const explicitDevUrl = process.env.VITE_DEV_SERVER_URL
  const candidates = [
    explicitDevUrl,
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:5174',
    'http://localhost:5174',
  ].filter(Boolean)

  let lastError = null
  for (const url of candidates) {
    try {
      writeMainLog(`trying dev url: ${url}`)
      await win.loadURL(url)
      writeMainLog(`dev url connected: ${url}`)
      return
    } catch (error) {
      lastError = error
      writeMainLog(`dev url failed: ${url} reason=${error && error.message ? error.message : String(error)}`)
    }
  }

  throw lastError || new Error('No Vite dev server URL could be reached.')
}

// ─────────────────────────────────────────────────────────────────────────────
// Window
// ─────────────────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: '#0e1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    writeMainLog(`did-fail-load code=${code} description=${description} url=${validatedURL}`)
    showStartupError(win, `did-fail-load (${code}): ${description}\nURL: ${validatedURL}`)
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    writeMainLog(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`)
  })

  win.webContents.on('did-finish-load', () => {
    writeMainLog(`did-finish-load url=${win.webContents.getURL()}`)
  })

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeMainLog(`renderer-console level=${level} source=${sourceId}:${line} message=${message}`)
  })

  win.on('close', (event) => {
    if (appQuitting) return
    event.preventDefault()
    win.hide()
  })

  if (isDev) {
    loadDevRenderer(win).catch((error) => {
      writeMainLog(`dev loadURL failed: ${error && error.message ? error.message : String(error)}`)
      const indexPath = resolveRendererIndexPath()
      if (indexPath) {
        win.loadFile(indexPath).catch((loadError) => {
          writeMainLog(`dev fallback loadFile failed: ${loadError && loadError.message ? loadError.message : String(loadError)}`)
          showStartupError(win, loadError && loadError.message ? loadError.message : String(loadError))
        })
      } else {
        showStartupError(win, 'Could not locate dist/index.html for development fallback.')
      }
    })
  } else {
    const indexPath = resolveRendererIndexPath()
    if (!indexPath) {
      const reason = 'Could not locate dist/index.html in packaged resources.'
      writeMainLog(reason)
      showStartupError(win, reason)
      return
    }

    win.loadFile(indexPath).catch((error) => {
      const reason = error && error.message ? error.message : String(error)
      writeMainLog(`packaged loadFile failed: ${reason}`)
      showStartupError(win, reason)
    })
  }

  mainWindow = win
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

function getForegroundAppMetadataWindows() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ success: false, message: 'Foreground metadata is only available on Windows host.' })
      return
    }

    const script = [
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class WinApi {',
      '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
      '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out int processId);',
      '}',
      '"@',
      '$hwnd = [WinApi]::GetForegroundWindow()',
      'if ($hwnd -eq [IntPtr]::Zero) { Write-Output "ERROR|No foreground window"; exit 1 }',
      '$pid = 0',
      '[WinApi]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null',
      '$p = Get-Process -Id $pid -ErrorAction Stop',
      '$exe = if ($p.Path) { [System.IO.Path]::GetFileName($p.Path) } else { "$($p.ProcessName).exe" }',
      '$name = if ($p.MainWindowTitle) { $p.MainWindowTitle } else { $p.ProcessName }',
      'Write-Output ("OK|{0}|{1}" -f $name, $exe)',
    ].join('; ')

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }
    )

    let out = ''
    let err = ''
    child.stdout.on('data', (c) => { out += String(c) })
    child.stderr.on('data', (c) => { err += String(c) })
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, message: err || out || 'Failed to inspect foreground app.' })
        return
      }

      const line = out
        .split(/\r?\n/)
        .map((x) => x.trim())
        .find((x) => x.startsWith('OK|'))

      if (!line) {
        resolve({ success: false, message: 'Foreground app output unavailable.' })
        return
      }

      const [, appName, executableName] = line.split('|')
      resolve({
        success: true,
        app: {
          appName: appName || 'Unknown App',
          executableName: executableName || undefined,
          categories: ['system'],
        },
        message: `Foreground app detected as ${appName || executableName || 'Unknown App'}.`,
      })
    })
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

function hostPlatformId() {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'macos'
  if (process.platform === 'linux') return 'linux'
  return 'web'
}

function simulatedInstalledApps(platform) {
  if (platform === 'windows') {
    return [
      {
        appName: 'WhatsApp',
        executableName: 'whatsapp.exe',
        deepLinks: ['https://web.whatsapp.com', 'whatsapp://send'],
        categories: ['social', 'messaging'],
      },
      {
        appName: 'Spotify',
        executableName: 'spotify.exe',
        deepLinks: ['spotify://', 'https://open.spotify.com'],
        categories: ['music'],
      },
      {
        appName: 'Settings',
        executableName: 'ms-settings:',
        deepLinks: ['ms-settings:'],
        categories: ['system'],
        sensitive: true,
      },
    ]
  }

  return []
}

async function handleNativeLaunchApp(appInput) {
  const raw = String(appInput || '').trim()
  if (!raw) return { success: false, message: 'No app specified.' }

  const mapped = APP_ALIASES[raw.toLowerCase()] || raw
  const isWhatsApp = /^whatsapp(?:\.exe)?$/i.test(mapped) || /^whatsapp$/i.test(raw)

  if (/^(https?:|mailto:|tel:|[a-z][a-z0-9+.-]*:\/\/)/i.test(mapped)) {
    try {
      await shell.openExternal(mapped)
      return { success: true, message: `Opened ${mapped}` }
    } catch (e) {
      return { success: false, message: e.message }
    }
  }

  if (process.platform === 'win32') {
    if (isWhatsApp) {
      try {
        await shell.openExternal('whatsapp://send')
        return { success: true, message: 'Opened WhatsApp desktop protocol.' }
      } catch {
        // Continue with executable/AppUserModel fallbacks.
      }

      const storeLaunch = await runPowerShellStart('shell:AppsFolder\\5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App')
      if (storeLaunch.success) {
        return { success: true, message: 'Opened WhatsApp desktop app.' }
      }
    }

    const r = await runPowerShellStart(mapped)
    if (r.success) return r
    if (mapped !== raw) {
      const fallback = await runPowerShellStart(raw)
      if (fallback.success) return fallback
    }

    if (isWhatsApp) {
      try {
        await shell.openExternal('https://web.whatsapp.com')
        return { success: true, message: 'Opened WhatsApp Web as fallback.' }
      } catch (e) {
        return { success: false, message: e.message }
      }
    }
  }

  return { success: false, message: `Could not launch ${raw}.` }
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
  return handleNativeLaunchApp(appInput)
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

ipcMain.handle('native:get-installed-apps-metadata', async (_ev, platformHint) => {
  const platform = String(platformHint || hostPlatformId())
  const apps = simulatedInstalledApps(platform)
  return {
    success: true,
    apps,
    message: `Returning ${apps.length} installed app metadata entries.`,
  }
})

ipcMain.handle('native:get-foreground-app-metadata', async () => {
  const live = await getForegroundAppMetadataWindows()
  if (live.success) return live

  return {
    success: true,
    app: {
      appName: 'Unknown App',
      executableName: undefined,
      categories: ['system'],
    },
    message: live.message || 'Foreground app detection unavailable.',
  }
})

ipcMain.handle('assistant:service:get-status', async () => ({
  enabled: assistantServiceState.enabled,
  listening: assistantServiceState.listening,
  wakeWord: assistantServiceState.wakeWord,
}))

ipcMain.handle('assistant:service:start', async (_ev, config = {}) => {
  const provider = String(config?.provider || assistantServiceState.provider || process.env.VOICE_PROVIDER || 'local_whisper').toLowerCase()
  assistantServiceState.provider = provider === 'native' ? 'native' : 'local_whisper'
  assistantServiceState.whisperModel = normalizeWhisperModel(config?.whisperModel || assistantServiceState.whisperModel)
  assistantServiceState.whisperDevice = normalizeWhisperDevice(config?.whisperDevice || assistantServiceState.whisperDevice)

  if (assistantServiceState.recognizerProcess) {
    try {
      assistantServiceState.recognizerProcess.kill()
    } catch {
      // Ignore stop errors; restart is best-effort.
    }
    assistantServiceState.recognizerProcess = null
    assistantServiceState.listening = false
  }

  assistantServiceState.enabled = true
  startBackgroundAssistantService()
  return { success: true }
})

ipcMain.handle('assistant:service:stop', async () => {
  stopBackgroundAssistantService()
  return { success: true }
})

ipcMain.handle('channel:connect', async (_ev, channelId, credentials = {}) => {
  const id = String(channelId || '').toLowerCase()
  if (!id) return false

  channelConnections.set(id, {
    connectedAt: Date.now(),
    credentials: credentials && typeof credentials === 'object' ? credentials : {},
  })

  if (id === 'whatsapp') {
    broadcastChannelMessage('whatsapp', {
      from: 'system',
      fromName: 'Patrich',
      content: 'WhatsApp channel connected (send path active).',
    })
  }

  return true
})

ipcMain.handle('channel:disconnect', async (_ev, channelId) => {
  const id = String(channelId || '').toLowerCase()
  channelConnections.delete(id)
})

ipcMain.handle('channel:send', async (_ev, channelId, to, content) => {
  const id = String(channelId || '').toLowerCase()
  const target = String(to || '').trim()
  const text = String(content || '').trim()
  const config = channelConnections.get(id) || { credentials: {} }

  if (!text) return false

  try {
    if (id === 'whatsapp') {
      const digits = target.replace(/\D/g, '')
      const url = digits
        ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(text)}`
      await shell.openExternal(url)
      return true
    }

    if (id === 'telegram') {
      const botToken = String(config.credentials?.botToken || config.credentials?.token || '').trim()
      if (!botToken || !target) return false
      const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: target, text }),
      })
      return response.ok
    }

    if (id === 'email') {
      const mailto = `mailto:${encodeURIComponent(target)}?body=${encodeURIComponent(text)}`
      await shell.openExternal(mailto)
      return true
    }

    if (id === 'discord') {
      const webhookUrl = String(config.credentials?.webhookUrl || '').trim()
      if (!webhookUrl) return false
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
      return response.ok
    }

    return false
  } catch {
    return false
  }
})

ipcMain.handle('native:mouse-move', async (_ev, x, y) => {
  if (process.platform !== 'win32') {
    return { success: false, message: 'Mouse automation currently supports Windows host only.' }
  }

  const pointX = Number(x)
  const pointY = Number(y)
  const script = [
    'Add-Type @"',
    'using System.Runtime.InteropServices;',
    'public class MouseNative {',
    '  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);',
    '}',
    '"@',
    `[MouseNative]::SetCursorPos(${pointX}, ${pointY}) | Out-Null`,
  ].join('; ')

  const result = await runPowerShellCommand(script)
  return result.success
    ? { success: true, message: `Moved pointer to ${pointX}, ${pointY}.` }
    : { success: false, message: result.stderr || 'Failed to move mouse.' }
})

ipcMain.handle('native:mouse-click', async (_ev, button = 'left') => {
  if (process.platform !== 'win32') {
    return { success: false, message: 'Mouse automation currently supports Windows host only.' }
  }

  const down = String(button).toLowerCase() === 'right' ? 0x0008 : 0x0002
  const up = String(button).toLowerCase() === 'right' ? 0x0010 : 0x0004
  const script = [
    'Add-Type @"',
    'using System.Runtime.InteropServices;',
    'public class MouseNative {',
    '  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);',
    '}',
    '"@',
    `[MouseNative]::mouse_event(${down},0,0,0,0)`,
    `[MouseNative]::mouse_event(${up},0,0,0,0)`,
  ].join('; ')

  const result = await runPowerShellCommand(script)
  return result.success
    ? { success: true, message: `${button} click dispatched.` }
    : { success: false, message: result.stderr || 'Failed to click mouse.' }
})

ipcMain.handle('native:keyboard-type', async (_ev, text) => {
  if (process.platform !== 'win32') {
    return { success: false, message: 'Keyboard automation currently supports Windows host only.' }
  }

  const escaped = String(text || '').replace(/'/g, "''")
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    `$send = '${escaped}'`,
    '[System.Windows.Forms.SendKeys]::SendWait($send)',
  ].join('; ')

  const result = await runPowerShellCommand(script)
  return result.success
    ? { success: true, message: 'Keyboard input dispatched.' }
    : { success: false, message: result.stderr || 'Failed to type keys.' }
})

ipcMain.handle('native:capture-screen', async () => {
  try {
    const primary = screen.getPrimaryDisplay()
    const source = (await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.max(1, primary.size.width),
        height: Math.max(1, primary.size.height),
      },
      fetchWindowIcons: false,
    }))[0]

    if (!source || source.thumbnail.isEmpty()) {
      return { success: false, message: 'No screen source available.' }
    }

    return {
      success: true,
      imageBase64: source.thumbnail.toPNG().toString('base64'),
    }
  } catch (error) {
    return { success: false, message: error.message || 'Capture failed.' }
  }
})

ipcMain.handle('native:capture-region', async (_ev, region) => {
  try {
    const primary = screen.getPrimaryDisplay()
    const source = (await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.max(1, primary.size.width),
        height: Math.max(1, primary.size.height),
      },
      fetchWindowIcons: false,
    }))[0]

    if (!source || source.thumbnail.isEmpty()) {
      return { success: false, message: 'No screen source available.' }
    }

    const image = source.thumbnail
    const x = Math.max(0, Number(region?.x || 0))
    const y = Math.max(0, Number(region?.y || 0))
    const width = Math.max(1, Number(region?.width || 1))
    const height = Math.max(1, Number(region?.height || 1))
    const cropped = image.crop({ x, y, width, height })
    return {
      success: true,
      imageBase64: cropped.toPNG().toString('base64'),
    }
  } catch (error) {
    return { success: false, message: error.message || 'Region capture failed.' }
  }
})

ipcMain.handle('native:run-ocr', async (_ev, imageBase64) => {
  try {
    const raw = String(imageBase64 || '').trim()
    if (!raw) {
      return { success: false, message: 'Empty OCR image payload.' }
    }

    const worker = await getOCRWorker()
    const imageBuffer = Buffer.from(raw, 'base64')
    const result = await worker.recognize(imageBuffer)
    const text = String(result?.data?.text || '')
    const words = mapOCRWords(result?.data?.words || [])
    const confidence = Number(result?.data?.confidence || 0)

    return {
      success: true,
      text,
      confidence,
      words,
    }
  } catch (error) {
    return { success: false, message: error.message || 'OCR failed.' }
  }
})

ipcMain.handle('native:run-ocr-file', async (_ev, imagePath) => {
  try {
    const targetPath = String(imagePath || '').trim()
    if (!targetPath) {
      return { success: false, message: 'Missing image path.' }
    }
    if (!fs.existsSync(targetPath)) {
      return { success: false, message: `Image path not found: ${targetPath}` }
    }

    const worker = await getOCRWorker()
    const result = await worker.recognize(targetPath)
    const text = String(result?.data?.text || '')
    const words = mapOCRWords(result?.data?.words || [])
    const confidence = Number(result?.data?.confidence || 0)

    return {
      success: true,
      text,
      confidence,
      words,
    }
  } catch (error) {
    return { success: false, message: error.message || 'OCR file failed.' }
  }
})

ipcMain.handle('native:browser-launch', async (_ev, opts = {}) => {
  await ensureBrowserAgentWindow(Boolean(opts.headless ?? true))
  return { success: true }
})

ipcMain.handle('native:browser-execute', async (_ev, action = {}) => {
  try {
    const browser = await ensureBrowserAgentWindow(true)
    const type = String(action.type || '').toLowerCase()

    if (type === 'navigate') {
      await browser.loadURL(String(action.url || 'about:blank'))
      return {
        success: true,
        url: browser.webContents.getURL(),
        title: browser.getTitle(),
      }
    }

    if (type === 'click') {
      const selector = cssEscape(action.selector || '')
      const ok = await browser.webContents.executeJavaScript(`(function(){ const el = document.querySelector("${selector}"); if (!el) return false; el.click(); return true; })()`, true)
      return {
        success: Boolean(ok),
        url: browser.webContents.getURL(),
        title: browser.getTitle(),
        error: ok ? undefined : `Selector not found: ${action.selector || ''}`,
      }
    }

    if (type === 'type') {
      const selector = cssEscape(action.selector || '')
      const value = cssEscape(action.value || '')
      const ok = await browser.webContents.executeJavaScript(`(function(){ const el = document.querySelector("${selector}"); if (!el) return false; el.focus(); if ('value' in el) { el.value = "${value}"; el.dispatchEvent(new Event('input', { bubbles: true })); return true; } el.textContent = "${value}"; return true; })()`, true)
      return {
        success: Boolean(ok),
        url: browser.webContents.getURL(),
        title: browser.getTitle(),
        error: ok ? undefined : `Selector not found: ${action.selector || ''}`,
      }
    }

    if (type === 'extract') {
      const selector = cssEscape(action.selector || 'body')
      const content = await browser.webContents.executeJavaScript(`(function(){ const el = document.querySelector("${selector}"); return el ? (el.innerText || el.textContent || '') : ''; })()`, true)
      return {
        success: true,
        content: String(content || ''),
        url: browser.webContents.getURL(),
        title: browser.getTitle(),
      }
    }

    if (type === 'eval') {
      const content = await browser.webContents.executeJavaScript(String(action.script || ''), true)
      return {
        success: true,
        content: typeof content === 'string' ? content : JSON.stringify(content),
        url: browser.webContents.getURL(),
        title: browser.getTitle(),
      }
    }

    if (type === 'screenshot') {
      const image = await browser.webContents.capturePage()
      return {
        success: true,
        screenshot: image.toPNG().toString('base64'),
        url: browser.webContents.getURL(),
        title: browser.getTitle(),
      }
    }

    return { success: false, error: `Unsupported browser action: ${type}` }
  } catch (error) {
    return { success: false, error: error.message || String(error) }
  }
})

ipcMain.handle('native:browser-close', async () => {
  if (browserAgentWindow && !browserAgentWindow.isDestroyed()) {
    browserAgentWindow.close()
  }
  browserAgentWindow = null
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

ipcMain.handle('native:read-file-base64', async (_ev, filePath) => {
  try {
    const safe = sandboxedPath(filePath)
    const content = fs.readFileSync(safe, 'base64')
    return { success: true, content }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('native:get-user-data-path', async () => {
  return app.getPath('userData')
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

ipcMain.handle('native:get-auth-context', async () => {
  const userId = os.userInfo().username || 'local-user'
  return {
    userId,
    role: 'user',
    sessionId: authSessionId,
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  setStartupBehavior()
  createWindow()
  if (launchedInBackground() && mainWindow) {
    mainWindow.hide()
  }
  startBackgroundAssistantService()
  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
      return
    }
    mainWindow.show()
    mainWindow.focus()
  })
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return
  // Keep process alive for background assistant service.
})

app.on('before-quit', () => {
  appQuitting = true
  stopBackgroundAssistantService()
})

const hasSingleLock = app.requestSingleInstanceLock()
if (!hasSingleLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
      return
    }
    mainWindow.show()
    mainWindow.focus()
  })
}
