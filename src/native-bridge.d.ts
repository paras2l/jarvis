export {}

type AssistiveSelector = {
  resourceId?: string
  contentDesc?: string
  visibleText?: string
}

type AssistiveAutomationOptions = {
  appName: string
  packageName?: string
  deepLinks?: string[]
  selectors: AssistiveSelector[]
  timeoutMs?: number
  retryCount?: number
  showOverlay?: boolean
}

type AssistiveAutomationResult = {
  success: boolean
  message: string
  reasonCode?: string
  selectorUsed?: string
}

type InAppActionRequest = {
  app: string
  action: string
  payload?: Record<string, unknown>
}

type InAppActionResult = {
  success: boolean
  message?: string
  action?: string
}

type InstalledAppMetadata = {
  appName: string
  packageName?: string
  bundleId?: string
  executableName?: string
  deepLinks?: string[]
  categories?: string[]
  sensitive?: boolean
}

declare global {
  interface Window {
    nativeBridge?: {
      assistantService?: {
        getStatus: () => Promise<{ enabled: boolean; listening: boolean; wakeWord: string }>
        start: (config?: {
          provider?: 'local_whisper' | 'native'
          whisperModel?: 'tiny' | 'base' | 'small'
          whisperDevice?: 'cpu' | 'gpu'
        }) => Promise<{ success: boolean }>
        stop: () => Promise<{ success: boolean }>
        onEvent: (callback: (payload: {
          timestamp: number
          type: 'status' | 'transcript' | 'command'
          listening?: boolean
          enabled?: boolean
          transcript?: string
          confidence?: number
          command?: string
        }) => void) => (() => void)
      }
      launchApp: (appName: string) => Promise<{ success: boolean; message: string }>
      openExternal: (target: string) => Promise<{ success: boolean; message: string }>
      openAppAssistive: (appName: string) => Promise<{ success: boolean; message: string }>
      openSpecialFolder: (folderName: string) => Promise<{ success: boolean; message: string }>
      openRecycleBin: () => Promise<{ success: boolean; message: string }>
      emptyRecycleBin: () => Promise<{ success: boolean; message: string }>
      revealInFolder: (targetPath: string) => Promise<{ success: boolean; message: string }>
      showDesktop: () => Promise<{ success: boolean; message: string }>
      controlWindow: (action: 'minimize' | 'maximize' | 'restore' | 'focus' | 'hide' | 'show') => Promise<{ success: boolean; message: string }>
      listRunningApps: () => Promise<{ success: boolean; apps?: Array<{ name: string; executableName?: string; windowTitle?: string }>; message?: string }>
      focusApp: (appName: string) => Promise<{ success: boolean; message: string }>
      listDir: (dirPath: string) => Promise<{ success: boolean; entries?: Array<{ name: string; path: string; isDir: boolean; size?: number }>; message?: string }>
      createFolder: (folderPath: string) => Promise<{ success: boolean; message: string }>
      copyPath: (sourcePath: string, destinationPath: string) => Promise<{ success: boolean; message: string }>
      movePath: (sourcePath: string, destinationPath: string) => Promise<{ success: boolean; message: string }>
      renamePath: (sourcePath: string, newName: string) => Promise<{ success: boolean; message: string }>
      deletePath: (targetPath: string) => Promise<{ success: boolean; message: string }>
      openPath: (targetPath: string) => Promise<{ success: boolean; message: string }>
      terminateProcess: (identifier: string) => Promise<{ success: boolean; message: string }>
      openAppAssistiveV2?: (
        options: AssistiveAutomationOptions
      ) => Promise<AssistiveAutomationResult>
      automationGoHome?: () => Promise<{ success: boolean; message?: string }>
      automationOpenDrawer?: () => Promise<{ success: boolean; message?: string }>
      automationSearchApp?: (query: string) => Promise<{ success: boolean; message?: string }>
      automationFindAppNode?: (
        selectors: AssistiveSelector[]
      ) => Promise<{ success: boolean; selectorUsed?: string; message?: string }>
      automationTapFoundNode?: () => Promise<{ success: boolean; message?: string }>
      automationVerifyForeground?: (
        packageName?: string
      ) => Promise<{ success: boolean; message?: string }>
      setAutomationOverlay?: (visible: boolean, message?: string) => Promise<{ success: boolean }>
      emergencyStopAutomation?: () => Promise<{ success: boolean; message: string }>
      getAutomationDeviceContext?: () => Promise<{
        model: string
        androidVersion: string
        locale: string
        oem?: string
      }>
      getInstalledAppsMetadata?: (
        platformHint?: string
      ) => Promise<{ success: boolean; apps: InstalledAppMetadata[]; message?: string }>
      getForegroundAppMetadata?: (
        platformHint?: string
      ) => Promise<{ success: boolean; app?: InstalledAppMetadata; message?: string }>
      getCurrentScreenRisk?: () => Promise<{
        level: 'safe' | 'sensitive'
        reason?: string
      }>
      setAutomationPermission: (
        enabled: boolean
      ) => Promise<{ success: boolean; enabled?: boolean; message: string }>
      getAutomationPermission: () => Promise<{
        success: boolean
        enabled?: boolean
        message: string
      }>
      getScreenSourceId: () => Promise<{ success: boolean; sourceId?: string; message?: string }>
      getForegroundWindow: () => Promise<{ success: boolean; windowTitle?: string; message?: string }>
      getHostPlatform: () => Promise<string>
      readPdf: (filePath: string) => Promise<{ success: boolean; text?: string; message?: string }>
      performInAppAction?: (request: InAppActionRequest) => Promise<InAppActionResult>
      
      // Humanoid Automation
      mouseMove: (x: number, y: number) => Promise<{ success: boolean; message: string }>
      mouseClick: (button: 'left' | 'right') => Promise<{ success: boolean; message: string }>
      keyboardType: (text: string) => Promise<{ success: boolean; message: string }>

      // Skill Persistence (The Autonomous Brain on disk)
      saveSkill: (appName: string, profile: unknown) => Promise<{ success: boolean; message?: string }>
      loadSkill: (appName: string) => Promise<{ success: boolean; profile?: unknown; message?: string }>
      listSkills: () => Promise<{ success: boolean; skills: string[]; message?: string }>

      // Self-Coding Engine (write/read/execute without IDE)
      writeFile: (filePath: string, content: string) => Promise<{ success: boolean; message?: string }>
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; message?: string }>
      readFileBase64: (filePath: string) => Promise<{ success: boolean; content?: string; message?: string }>
      runShellCommand: (command: string, opts?: { cwd?: string; timeoutMs?: number }) => Promise<{ success: boolean; output?: string; error?: string; exitCode?: number; message?: string }>
      listExtensions?: () => Promise<{ success: boolean; extensions?: string[]; message?: string }>
      captureScreen?: () => Promise<{ success: boolean; imageBase64?: string; message?: string }>
      captureRegion?: (region: { x: number; y: number; width: number; height: number }) => Promise<{ success: boolean; imageBase64?: string; message?: string }>
      runOCR?: (imageBase64: string) => Promise<{ success: boolean; text?: string; confidence?: number; words?: Array<{ text: string; confidence: number; bbox: { x: number; y: number; width: number; height: number } }>; message?: string }>
      runOCRFile?: (imagePath: string) => Promise<{ success: boolean; text?: string; confidence?: number; words?: Array<{ text: string; confidence: number; bbox: { x: number; y: number; width: number; height: number } }>; message?: string }>

      // Path helpers
      getUserDataPath: () => string
      getProjectRoot: () => string
      getWorkspacePath: () => Promise<{ path: string }>
      getPythonScriptsPath: () => Promise<{ path: string }>
      getAuthContext?: () => Promise<{
        userId: string
        role: 'user' | 'owner'
        sessionId: string
        commander?: string
        codeword?: string
      }>

      // ── Wave 2: CDP Browser Control (C-6) ──────────────────────────────
      browser?: {
        launch?: (opts?: { headless?: boolean }) => Promise<{ success: boolean }>
        execute?: (action: {
          type: string; selector?: string; value?: string; url?: string; script?: string
        }) => Promise<{ success: boolean; content?: string; screenshot?: string; url?: string; title?: string; error?: string }>
        getState?: () => Promise<{ success: boolean; url?: string; title?: string; visible?: boolean; focused?: boolean; message?: string }>
        reload?: () => Promise<{ success: boolean; url?: string; title?: string; message?: string }>
        openCurrent?: () => Promise<{ success: boolean; message?: string }>
        close?: () => Promise<void>
      }

      // ── Phase 5: Bulk Automation & Content Processing ──────────────────
      bulk?: {
        compressPath?: (sourcePath: string, destinationPath: string, format?: 'zip' | 'tar.gz' | 'gzip') => Promise<{ success: boolean; path?: string; message?: string }>
        extractArchive?: (archivePath: string, destinationPath: string) => Promise<{ success: boolean; path?: string; message?: string }>
        bulkMoveByPattern?: (sourceDir: string, pattern: string, destinationDir: string, useRegex?: boolean) => Promise<{ success: boolean; moved?: Array<{ from: string; to: string }>; count?: number; message?: string }>
        searchFileContent?: (searchDir: string, textPattern: string, fileExtPattern?: string) => Promise<{ success: boolean; results?: Array<{ file: string; matches: number }>; count?: number; message?: string }>
        getFileStats?: (filePath: string) => Promise<{ success: boolean; stats?: { size: number; created: string; modified: string; isFile: boolean; isDirectory: boolean; permissions: string; sha256: string }; message?: string }>
        calculateHash?: (filePath: string, algorithm?: 'sha256' | 'sha512' | 'md5') => Promise<{ success: boolean; hash?: string; algorithm?: string; message?: string }>
      }

      // ── Phase 6: Advanced Automation & System Monitoring ──────────────────
      monitor?: {
        getSystemResources?: () => Promise<{ success: boolean; resources?: { memoryTotal: number; memoryFree: number; memoryUsed: number; memoryPercent: number; cpuCount: number; loadAverage: { oneMin: number; fiveMin: number; fifteenMin: number }; uptime: number; platform: string; arch: string; hostname: string }; message?: string }>
        getDiskUsage?: (dirPath?: string) => Promise<{ success: boolean; diskTotal?: number; diskUsed?: number; diskFree?: number; diskPercent?: number; message?: string }>
        getSystemInfo?: () => Promise<{ success: boolean; info?: { platform: string; arch: string; hostname: string; userInfo: any; uptime: number; networkInterfaces: string[] }; message?: string }>
      }

      environment?: {
        getEnvVar?: (varName: string) => Promise<{ success: boolean; varName?: string; value?: string | null; found?: boolean; message?: string }>
        setEnvVar?: (varName: string, value: string) => Promise<{ success: boolean; varName?: string; value?: string; message?: string }>
        listEnvVars?: (filterPattern?: string) => Promise<{ success: boolean; count?: number; variables?: Record<string, string>; message?: string }>
      }

      automation?: {
        scheduleTask?: (delayMs: number, command?: string) => Promise<{ success: boolean; taskId?: string; scheduledAt?: string; executeAt?: string; message?: string }>
        cancelTask?: (taskId: string) => Promise<{ success: boolean; taskId?: string; message?: string }>
        listScheduledTasks?: () => Promise<{ success: boolean; count?: number; tasks?: Array<{ taskId: string }>; message?: string }>
      }

      // ── Phase 7: Advanced System Interaction & Utilities ──────────────────
      clipboard?: {
        getClipboard?: () => Promise<{ success: boolean; text?: string; length?: number; message?: string }>
        setClipboard?: (text: string) => Promise<{ success: boolean; message?: string }>
        clearClipboard?: () => Promise<{ success: boolean; message?: string }>
      }

      window?: {
        moveWindow?: (x: number, y: number, width?: number, height?: number) => Promise<{ success: boolean; x?: number; y?: number; width?: number; height?: number; message?: string }>
        snapWindow?: (edge?: 'left' | 'right' | 'top' | 'bottom' | 'topleft' | 'topright' | 'bottomleft' | 'bottomright' | 'center') => Promise<{ success: boolean; x?: number; y?: number; edge?: string; message?: string }>
      }

      media?: {
        control?: (command: 'play' | 'pause' | 'next' | 'previous' | 'stop' | 'volumeup' | 'volumedown' | 'mute') => Promise<{ success: boolean; message?: string }>
      }

      network?: {
        checkConnectivity?: (targetHost?: string) => Promise<{ success?: boolean; reachable?: boolean; host?: string; message?: string }>
      }

      notifications?: {
        show?: (title: string, message: string, opts?: { icon?: string }) => Promise<{ success: boolean; message?: string }>
      }

      // ── Wave 2: MCP Protocol (J-R1) ────────────────────────────────────
      mcp?: {
        listTools?: (server: { id: string; type: string; command?: string; url?: string }) => Promise<Array<{
          name: string; description: string; inputSchema: Record<string, unknown>
        }>>
        callTool?: (
          server: { id: string; type: string; command?: string; url?: string },
          toolName: string,
          args: Record<string, unknown>
        ) => Promise<{ success: boolean; content: Array<{ type: string; text?: string; data?: string }>; error?: string }>
        // Vibe Workspace support
        readDir?: (path: string) => Promise<{ success: boolean; files: Array<{ name: string; isDir: boolean; size?: number }>; error?: string }>

        // Stealth Engine support
        checkUserBusy?: () => Promise<boolean>
      }

      // ── Wave 2: Daemon Mode (C-4) ───────────────────────────────────────
      daemon?: {
        start?: () => Promise<void>
        stop?: () => Promise<void>
        setStatus?: (status: string) => void
        setAutoStart?: (enabled: boolean) => Promise<void>
        heartbeat?: (state: { status: string; uptime: string; tasksCompleted: number }) => void
      }

      // ── Wave 2: Webhook Server (C-8) ────────────────────────────────────
      webhook?: {
        start?: (port: number) => Promise<boolean>
        stop?: () => Promise<void>
        registerPath?: (path: string) => void
        onReceive?: (callback: (payload: {
          endpoint: string; body: unknown; headers: Record<string, string>; timestamp: number; source?: string
        }) => void) => void
      }

      // ── Wave 2: Multi-Channel Inbox (C-1) ────────────────────────────────
      channel?: {
        connect?: (channelId: string, credentials: Record<string, string>) => Promise<boolean>
        disconnect?: (channelId: string) => Promise<void>
        send?: (channelId: string, to: string, content: string) => Promise<boolean>
        onMessage?: (channelId: string, callback: (data: {
          from: string; fromName?: string; content: string; raw?: unknown
        }) => void) => void
      }
    }
  }
}
