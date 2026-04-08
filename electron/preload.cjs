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
  openSpecialFolder: (folderName) =>
    ipcRenderer.invoke('native:open-special-folder', folderName),
  openRecycleBin: () =>
    ipcRenderer.invoke('native:open-recycle-bin'),
  emptyRecycleBin: () =>
    ipcRenderer.invoke('native:empty-recycle-bin'),
  revealInFolder: (targetPath) =>
    ipcRenderer.invoke('native:reveal-in-folder', targetPath),
  showDesktop: () =>
    ipcRenderer.invoke('native:show-desktop'),
  controlWindow: (action) =>
    ipcRenderer.invoke('native:control-window', action),
  listRunningApps: () =>
    ipcRenderer.invoke('native:list-running-apps'),
  focusApp: (appName) =>
    ipcRenderer.invoke('native:focus-app', appName),
  listDir: (dirPath) =>
    ipcRenderer.invoke('native:list-dir', dirPath),
  createFolder: (folderPath) =>
    ipcRenderer.invoke('native:create-folder', folderPath),
  copyPath: (sourcePath, destinationPath) =>
    ipcRenderer.invoke('native:copy-path', sourcePath, destinationPath),
  movePath: (sourcePath, destinationPath) =>
    ipcRenderer.invoke('native:move-path', sourcePath, destinationPath),
  renamePath: (sourcePath, newName) =>
    ipcRenderer.invoke('native:rename-path', sourcePath, newName),
  deletePath: (targetPath) =>
    ipcRenderer.invoke('native:delete-path', targetPath),
  openPath: (targetPath) =>
    ipcRenderer.invoke('native:open-path', targetPath),
  terminateProcess: (identifier) =>
    ipcRenderer.invoke('native:terminate-process', identifier),
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
    getState: () => ipcRenderer.invoke('native:browser-get-state'),
    reload: () => ipcRenderer.invoke('native:browser-reload'),
    openCurrent: () => ipcRenderer.invoke('native:browser-open-current'),
    close: () => ipcRenderer.invoke('native:browser-close'),
  },

  // ── Phase 5: Bulk Automation & Content Processing ────────────────────
  bulk: {
    compressPath: (sourcePath, destinationPath, format) =>
      ipcRenderer.invoke('native:compress-path', sourcePath, destinationPath, format),
    extractArchive: (archivePath, destinationPath) =>
      ipcRenderer.invoke('native:extract-archive', archivePath, destinationPath),
    bulkMoveByPattern: (sourceDir, pattern, destinationDir, useRegex) =>
      ipcRenderer.invoke('native:bulk-move-by-pattern', sourceDir, pattern, destinationDir, useRegex),
    searchFileContent: (searchDir, textPattern, fileExtPattern) =>
      ipcRenderer.invoke('native:search-file-content', searchDir, textPattern, fileExtPattern),
    getFileStats: (filePath) =>
      ipcRenderer.invoke('native:get-file-stats', filePath),
    calculateHash: (filePath, algorithm) =>
      ipcRenderer.invoke('native:calculate-hash', filePath, algorithm),
  },

  // ── Phase 6: Advanced Automation & System Monitoring ─────────────────
  monitor: {
    getSystemResources: () =>
      ipcRenderer.invoke('native:get-system-resources'),
    getDiskUsage: (dirPath) =>
      ipcRenderer.invoke('native:get-disk-usage', dirPath),
    getSystemInfo: () =>
      ipcRenderer.invoke('native:get-system-info'),
  },

  environment: {
    getEnvVar: (varName) =>
      ipcRenderer.invoke('native:get-env-var', varName),
    setEnvVar: (varName, value) =>
      ipcRenderer.invoke('native:set-env-var', varName, value),
    listEnvVars: (filterPattern) =>
      ipcRenderer.invoke('native:list-env-vars', filterPattern),
  },

  automation: {
    scheduleTask: (delayMs, command) =>
      ipcRenderer.invoke('native:schedule-task', delayMs, command),
    cancelTask: (taskId) =>
      ipcRenderer.invoke('native:cancel-task', taskId),
    listScheduledTasks: () =>
      ipcRenderer.invoke('native:list-scheduled-tasks'),
  },

  // ── Phase 7: Advanced System Interaction & Utilities ───────────────────
  clipboard: {
    getClipboard: () =>
      ipcRenderer.invoke('native:get-clipboard'),
    setClipboard: (text) =>
      ipcRenderer.invoke('native:set-clipboard', text),
    clearClipboard: () =>
      ipcRenderer.invoke('native:clear-clipboard'),
  },

  window: {
    moveWindow: (x, y, width, height) =>
      ipcRenderer.invoke('native:move-window', x, y, width, height),
    snapWindow: (edge) =>
      ipcRenderer.invoke('native:snap-window', edge),
  },

  media: {
    control: (command) =>
      ipcRenderer.invoke('native:media-control', command),
  },

  network: {
    checkConnectivity: (targetHost) =>
      ipcRenderer.invoke('native:check-connectivity', targetHost),
  },

  notifications: {
    show: (title, message, opts) =>
      ipcRenderer.invoke('native:show-notification', title, message, opts),
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
