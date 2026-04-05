const { contextBridge, ipcRenderer } = require('electron')
const os = require('os')

contextBridge.exposeInMainWorld('nativeBridge', {
  // App launching
  launchApp: (appName) => ipcRenderer.invoke('native:launch-app', appName),
  openExternal: (target) => ipcRenderer.invoke('native:open-external', target),
  openAppAssistive: (appName) => ipcRenderer.invoke('native:open-app-assistive', appName),

  // Permissions
  setAutomationPermission: (enabled) => ipcRenderer.invoke('native:set-automation-permission', enabled),
  getAutomationPermission: () => ipcRenderer.invoke('native:get-automation-permission'),

  // Screen
  getScreenSourceId: () => ipcRenderer.invoke('native:get-screen-source-id'),
  getForegroundWindow: () => ipcRenderer.invoke('native:get-foreground-window'),
  getHostPlatform: () => Promise.resolve(os.platform()),

  // PDF reading (local + remote)
  readPdf: (filePath) => ipcRenderer.invoke('read-pdf', filePath),

  // Skill persistence (The Brain on disk)
  saveSkill: (appName, profile) => ipcRenderer.invoke('native:save-skill', { appName, profile }),
  loadSkill: (appName) => ipcRenderer.invoke('native:load-skill', { appName }),
  listSkills: () => ipcRenderer.invoke('native:list-skills'),

  // Humanoid automation
  mouseMove: (x, y) => ipcRenderer.invoke('native:mouse-move', { x, y }),
  mouseClick: (button) => ipcRenderer.invoke('native:mouse-click', button),
  keyboardType: (text) => ipcRenderer.invoke('native:keyboard-type', text),

  // Self-Coding Engine (direct file system access — no IDE required)
  writeFile: (filePath, content) => ipcRenderer.invoke('native:write-file', { filePath, content }),
  readFile: (filePath) => ipcRenderer.invoke('native:read-file', { filePath }),
  runShellCommand: (command, cwd) => ipcRenderer.invoke('native:run-shell-command', { command, cwd }),
})
