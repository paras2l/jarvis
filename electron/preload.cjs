const { contextBridge, ipcRenderer } = require('electron')
const os = require('os')

contextBridge.exposeInMainWorld('nativeBridge', {
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

  // ── Shell Commands (AI inference) ───────────────────────────────────
  runShellCommand: (command, opts) =>
    ipcRenderer.invoke('native:run-command', command, opts),

  // ── File I/O (artifact management) ──────────────────────────────────
  writeFile: (filePath, content) =>
    ipcRenderer.invoke('native:write-file', filePath, content),
  readFile: (filePath) =>
    ipcRenderer.invoke('native:read-file', filePath),
  fileExists: (filePath) =>
    ipcRenderer.invoke('native:file-exists', filePath),
  getWorkspacePath: () =>
    ipcRenderer.invoke('native:get-workspace-path'),
  getPythonScriptsPath: () =>
    ipcRenderer.invoke('native:get-python-scripts-path'),
})
