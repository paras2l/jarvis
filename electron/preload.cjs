const { contextBridge, ipcRenderer } = require('electron')
const os = require('os')

contextBridge.exposeInMainWorld('nativeBridge', {
  assistantService: {
    getStatus: () => ipcRenderer.invoke('assistant:service:get-status'),
    start: (config) => ipcRenderer.invoke('assistant:service:start', config),
    stop: () => ipcRenderer.invoke('assistant:service:stop'),
    onEvent: (callback) => {
      const handler = (_event, payload) => callback(payload)
      ipcRenderer.on('assistant:event', handler)
      return () => ipcRenderer.removeListener('assistant:event', handler)
    },
  },
  // ── App Launch ──────────────────────────────────────────────────────
  launchApp: (appName) =>
    ipcRenderer.invoke('native:launch-app', appName),
  openExternal: (target) =>
    ipcRenderer.invoke('native:open-external', target),
  openAppAssistive: (appName) =>
    ipcRenderer.invoke('native:open-app-assistive', appName),
  setAutomationPermission: (enabled) =>
    ipcRenderer.invoke('native:set-automation-permission', enabled),
  getAutomationPermission: () =>
    ipcRenderer.invoke('native:get-automation-permission'),
  getHostPlatform: () => Promise.resolve(os.platform()),
  getInstalledAppsMetadata: (platformHint) =>
    ipcRenderer.invoke('native:get-installed-apps-metadata', platformHint),
  getForegroundAppMetadata: (platformHint) =>
    ipcRenderer.invoke('native:get-foreground-app-metadata', platformHint),

  // ── Desktop Controls ────────────────────────────────────────────────
  mouseMove: (x, y) =>
    ipcRenderer.invoke('native:mouse-move', x, y),
  mouseClick: (button) =>
    ipcRenderer.invoke('native:mouse-click', button),
  keyboardType: (text) =>
    ipcRenderer.invoke('native:keyboard-type', text),
  captureScreen: () =>
    ipcRenderer.invoke('native:capture-screen'),
  captureRegion: (region) =>
    ipcRenderer.invoke('native:capture-region', region),
  runOCR: (imageBase64) =>
    ipcRenderer.invoke('native:run-ocr', imageBase64),
  runOCRFile: (imagePath) =>
    ipcRenderer.invoke('native:run-ocr-file', imagePath),

  // ── Browser Automation ──────────────────────────────────────────────
  browser: {
    launch: (opts) => ipcRenderer.invoke('native:browser-launch', opts),
    execute: (action) => ipcRenderer.invoke('native:browser-execute', action),
    close: () => ipcRenderer.invoke('native:browser-close'),
  },

  // ── Multi-Channel Bridge ────────────────────────────────────────────
  channel: {
    connect: (channelId, credentials) =>
      ipcRenderer.invoke('channel:connect', channelId, credentials),
    disconnect: (channelId) =>
      ipcRenderer.invoke('channel:disconnect', channelId),
    send: (channelId, to, content) =>
      ipcRenderer.invoke('channel:send', channelId, to, content),
    onMessage: (channelId, callback) => {
      const handler = (_event, payload) => {
        if (payload?.channelId === channelId) {
          callback(payload.data || {})
        }
      }
      ipcRenderer.on('channel:message', handler)
      return () => ipcRenderer.removeListener('channel:message', handler)
    },
  },

  // ── Shell Commands (AI inference) ───────────────────────────────────
  runShellCommand: (command, opts) =>
    ipcRenderer.invoke('native:run-command', command, opts),

  // ── File I/O (artifact management) ──────────────────────────────────
  writeFile: (filePath, content) =>
    ipcRenderer.invoke('native:write-file', filePath, content),
  readFile: (filePath) =>
    ipcRenderer.invoke('native:read-file', filePath),
  readFileBase64: (filePath) =>
    ipcRenderer.invoke('native:read-file-base64', filePath),
  fileExists: (filePath) =>
    ipcRenderer.invoke('native:file-exists', filePath),
  getWorkspacePath: () =>
    ipcRenderer.invoke('native:get-workspace-path'),
  getUserDataPath: () =>
    ipcRenderer.invoke('native:get-user-data-path'),
  getPythonScriptsPath: () =>
    ipcRenderer.invoke('native:get-python-scripts-path'),
  getAuthContext: () =>
    ipcRenderer.invoke('native:get-auth-context'),
})
