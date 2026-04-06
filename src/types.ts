// Message and Chat Types
export interface Message {
  id: string
  type: 'user' | 'agent'
  content: string
  timestamp: Date
  metadata?: {
    voiceInput?: boolean
    taskId?: string
  }
}

export interface ChatHistory {
  id: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
  agentId?: string
}

// Task Types
export interface Task {
  id: string
  command: string
  type: 'app_launch' | 'message_send' | 'call' | 'screen_control' | 'custom'
  status: 'pending' | 'executing' | 'completed' | 'failed'
  result?: unknown
  error?: string
  createdAt: Date
  completedAt?: Date
}

// Agent Types
export interface Agent {
  id: string
  name: string
  description?: string
  type: 'main' | 'sub'
  capabilities: string[]
  boundaries?: Boundary[]
  connectedAPIs: ConnectedAPI[]
  status: 'active' | 'inactive'
  createdAt: Date
}

export interface Boundary {
  id: string
  type: 'permission' | 'rate_limit' | 'resource'
  rule: string
  enabled: boolean
}

// API Types
export interface ConnectedAPI {
  id: string
  name: string
  type: 'knowledge' | 'action' | 'both'
  endpoint: string
  apiKey?: string
  config?: Record<string, unknown>
  enabled: boolean
}

// Voice Types
export interface VoiceConfig {
  activationKeyword: string
  sensitivity: number
  autoDetect: boolean
  continuousMode: boolean
  locale: string
}

// Settings Types
export interface AppSettings {
  theme: 'light' | 'dark' | 'auto'
  voice: VoiceConfig
  notifications: boolean
  soundEnabled: boolean
  fontSize: 'small' | 'medium' | 'large'
  autoSaveHistory: boolean
}

// Execution Context
export interface ExecutionContext {
  userId: string
  agentId: string
  taskId: string
  device: 'desktop' | 'mobile'
  platform: 'windows' | 'macos' | 'linux' | 'android' | 'ios'
}

// Command Parse Result
export interface ParsedCommand {
  intent: string
  action: string
  parameters: Record<string, unknown>
  confidence: number
  subAgentRequired: boolean
  targetDevice?: string // Phase 3: device ID if targeting specific device
}

// Phase 3: Device Mesh Types
export interface Device {
  id: string // Unique device identifier (UUID)
  name: string
  type: 'desktop' | 'mobile' | 'tablet' | 'wearable' | 'smart-home'
  platform: 'windows' | 'macos' | 'linux' | 'android' | 'ios'
  status: 'online' | 'offline' | 'sleep'
  networkAddress?: string // IP/Bluetooth address
  lastSeen: Date
  capabilities: string[] // e.g., ['wake-via-bluetooth', 'wake-via-wifi', 'open-apps', 'send-sms']
  location?: {
    room?: string
    zone?: string
    distance?: number // Approximate distance in meters
  }
  permissions: DevicePermission[]
  registeredAt: Date
}

export interface DevicePermission {
  id: string
  sourceDeviceId: string // Which device can control
  targetDeviceId: string // Which device is being controlled
  actions: string[] // ['app_launch', 'screen_control', 'call', 'message_send']
  approved: boolean
  approvedAt?: Date
}

export interface DeviceMessage {
  id: string
  fromDeviceId: string
  toDeviceId: string
  type: 'task' | 'response' | 'wake-request' | 'status-query'
  payload: {
    command?: string
    taskId?: string
    result?: unknown
    error?: string
    status?: string
  }
  timestamp: Date
  priority: 'low' | 'normal' | 'high'
  confirmed: boolean
}

export interface RemoteTask extends Task {
  targetDeviceId: string
  sourceDeviceId: string
  relayedAt?: Date
  responseReceived?: boolean
}

export interface WakeProtocol {
  id: string
  deviceId: string
  type: 'bluetooth' | 'wifi' | 'push-notification' | 'http-request'
  config: Record<string, unknown>
  enabled: boolean
  lastUsed?: Date
}

// API Integration Types (Session 2)
export type APIProvider = 'nvidia' | 'huggingface' | 'replicate' | 'openai' | 'custom'

export interface APIConfig {
  id: string
  provider: APIProvider
  apiKey: string
  name: string
  createdAt: string
  lastUsed: string | null
}

export interface APIExecutionStats {
  provider: APIProvider
  success: boolean
  executionTimeMs: number
  model?: string
  tokensUsed?: number
}
