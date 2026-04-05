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
      launchApp: (appName: string) => Promise<{ success: boolean; message: string }>
      openExternal: (target: string) => Promise<{ success: boolean; message: string }>
      openAppAssistive: (appName: string) => Promise<{ success: boolean; message: string }>
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
      runShellCommand: (command: string, cwd?: string) => Promise<{ success: boolean; output?: string; error?: string; exitCode?: number; message?: string }>
      listExtensions?: () => Promise<{ success: boolean; extensions?: string[]; message?: string }>
      captureScreen?: () => Promise<{ success: boolean; imageBase64?: string; message?: string }>
      captureRegion?: (region: { x: number; y: number; width: number; height: number }) => Promise<{ success: boolean; imageBase64?: string; message?: string }>
      runOCR?: (imageBase64: string) => Promise<{ success: boolean; text?: string; confidence?: number; words?: Array<{ text: string; confidence: number; bbox: { x: number; y: number; width: number; height: number } }>; message?: string }>
      runOCRFile?: (imagePath: string) => Promise<{ success: boolean; text?: string; confidence?: number; words?: Array<{ text: string; confidence: number; bbox: { x: number; y: number; width: number; height: number } }>; message?: string }>

      // Path helpers
      getUserDataPath?: () => string
      getProjectRoot?: () => string

      // ── Wave 2: CDP Browser Control (C-6) ──────────────────────────────
      browser?: {
        launch?: (opts?: { headless?: boolean }) => Promise<{ success: boolean }>
        execute?: (action: {
          type: string; selector?: string; value?: string; url?: string; script?: string
        }) => Promise<{ success: boolean; content?: string; screenshot?: string; url?: string; title?: string; error?: string }>
        close?: () => Promise<void>
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
