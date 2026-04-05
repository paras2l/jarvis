export type PlatformId = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'web'

export type LaunchabilityState =
  | 'launchable_by_intent'
  | 'launchable_by_screen_automation'
  | 'blocked'

export type LaunchStrategy =
  | 'native_name'
  | 'native_path'
  | 'package_name'
  | 'deep_link'
  | 'ui_automation'
  | 'web_search'

export type LaunchReasonCode =
  | 'ok'
  | 'no_provider'
  | 'bridge_unavailable'
  | 'plugin_unavailable'
  | 'permission_denied'
  | 'target_missing'
  | 'no_target'
  | 'open_blocked'
  | 'unsupported_strategy'
  | 'launch_failed'
  | 'platform_not_supported'
  | 'sensitive_action_blocked'
  | 'emergency_override_required'
  | 'unknown'

export interface LaunchExecution {
  success: boolean
  message: string
  reasonCode: LaunchReasonCode
  launchabilityState?: LaunchabilityState
  selectorUsed?: string
}

export interface AppSelectorVariant {
  resourceId?: string
  contentDesc?: string
  visibleText?: string
  locale?: string
  oem?: string
}

export interface AppFallbackPolicy {
  launchability: LaunchabilityState
  blockedReason?: string
  allowScreenAutomation: boolean
  requiresManualAuthHandoff: boolean
  sensitiveByDefault: boolean
}

export interface LaunchRequest {
  appName: string
  executableName?: string
  executablePath?: string
  packageName?: string
  deepLinks?: string[]
  webFallback?: string
  sensitiveOperation?: boolean
  emergencyPassphrase?: string
  requireManualAuthHandoff?: boolean
  fallbackPolicy?: AppFallbackPolicy
  appSelectors?: AppSelectorVariant[]
}

export interface LaunchResult {
  success: boolean
  strategy: LaunchStrategy
  message: string
  reasonCode: LaunchReasonCode
  launchabilityState: LaunchabilityState
  platform: PlatformId
  attempted: LaunchStrategy[]
  selectorUsed?: string
}

export type PermissionArea = 'native_launch' | 'ui_automation'

export interface PermissionState {
  nativeLaunch: boolean
  uiAutomation: boolean
  stealthMode: boolean
  emergencyOverrideUntil?: number
  emergencyPassphrase?: string
}

export interface AuditEntry {
  id: string
  timestamp: string
  appName: string
  platform: PlatformId
  strategy: LaunchStrategy
  success: boolean
  message: string
  reasonCode: LaunchReasonCode
  selectorUsed?: string
  launchabilityState?: LaunchabilityState
}

export interface SelectorTelemetryEntry {
  appName: string
  selectorKey: string
  deviceModel: string
  androidVersion: string
  success: boolean
  timestamp: string
}

export interface LaunchProvider {
  canHandle(platform: PlatformId, strategy: LaunchStrategy): boolean
  launch(
    platform: PlatformId,
    strategy: LaunchStrategy,
    request: LaunchRequest
  ): Promise<LaunchExecution>
}
