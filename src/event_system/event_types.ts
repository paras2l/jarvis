export type SystemEventName =
  | 'context_updated'
  | 'task_created'
  | 'task_completed'
  | 'task_failed'
  | 'task_dispatched'
  | 'task_scheduled'
  | 'plan_created'
  | 'plan_selected'
  | 'agent_assigned'
  | 'agent_completed'
  | 'command_received'
  | 'command_parsed'
  | 'command_routed'
  | 'command_executed'
  | 'memory_recorded'
  | 'memory_recalled'
  | 'memory_synced'
  | 'error_occurred'
  | 'runtime_started'
  | 'runtime_stopped'
  | 'runtime_tick'
  | 'vision_snapshot'
  | 'prediction_generated'
  | 'reflection_ready'
  | 'skill_registered'
  | 'skill_executed'
  | 'device_registered'
  | 'device_updated'
  | 'notification_emitted'
  | 'learning_cycle_started'
  | 'learning_cycle_completed'

export interface EventEnvelope<T = unknown> {
  id: string
  name: SystemEventName
  source: string
  timestamp: number
  correlationId?: string
  causationId?: string
  payload: T
  metadata: Record<string, unknown>
}

export interface EventSubscriptionOptions {
  once?: boolean
  replayLast?: boolean
  priority?: number
}

export interface EventDispatchOptions {
  source?: string
  correlationId?: string
  causationId?: string
  metadata?: Record<string, unknown>
  delayMs?: number
}

export interface EventMiddlewareResult {
  envelope: EventEnvelope
  allow: boolean
}

export interface EventHistoryEntry<T = unknown> extends EventEnvelope<T> {
  deliveredTo: number
  failedToDeliver: number
  durationMs: number
}

export interface ContextUpdatedPayload {
  snapshot: {
    timestamp: number
    activeWindowTitle: string
    foregroundApp?: string
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'
    recentConversationSummary: string
    systemBusy: boolean
    activeApplications?: string[]
    userActivity?: string
    screenSummary?: string
    pendingNotifications?: Array<{
      source: string
      title: string
      importance: 'info' | 'high' | 'critical'
    }>
    calendarSignals?: string[]
    lastUserCommand?: string
    deviceState?: {
      localDeviceId: string
      localDeviceStatus: 'online' | 'offline' | 'sleep'
      activeDeviceCount: number
      totalDeviceCount: number
      capabilities: string[]
    }
  }
}

export interface TaskCreatedPayload {
  taskId: string
  title: string
  command: string
  goalId?: string
  agentRole?: string
  skillName?: string
  targetDeviceId?: string
  priority?: number
}

export interface TaskCompletedPayload {
  taskId: string
  success: boolean
  result?: unknown
  summary?: string
  error?: string
  goalId?: string
  agentId?: string
}

export interface ErrorOccurredPayload {
  component: string
  operation: string
  message: string
  errorType?: string
  stack?: string
  context?: Record<string, unknown>
}

export interface CommandReceivedPayload {
  commandId: string
  text: string
  source: string
  metadata?: Record<string, unknown>
}

export interface CommandParsedPayload {
  commandId: string
  originalText: string
  intent: string
  confidence: number
  requiresConfirmation: boolean
  metadata?: Record<string, unknown>
}

export interface CommandRoutedPayload {
  commandId: string
  routeCount: number
  targetKinds: string[]
  metadata?: Record<string, unknown>
}

export interface CommandExecutedPayload {
  commandId: string
  success: boolean
  summary: string
  executionId?: string
  metadata?: Record<string, unknown>
}

export interface MemoryRecordedPayload {
  key: string
  scope: 'short_term' | 'long_term' | 'semantic'
  source: string
  tags: string[]
}

export interface MemoryRecalledPayload {
  key: string
  hit: boolean
  scope: 'short_term' | 'long_term' | 'semantic'
}

export interface RuntimeTickPayload {
  cycle: number
  timestamp: number
  queueSize?: number
}

export interface RuntimeStartedPayload {
  timestamp: number
  mode?: string
}

export interface RuntimeStoppedPayload {
  timestamp: number
  reason?: string
}

export interface PlanCreatedPayload {
  planId: string
  goal: string
  stepCount: number
  intent?: string
}

export interface PlanSelectedPayload {
  planId: string
  strategy: string
  score: number
  reason?: string
}

export interface AgentAssignedPayload {
  taskId: string
  agentId: string
  agentName: string
  agentRole?: string
}

export interface SkillRegisteredPayload {
  skillId: string
  name: string
  category: string
  origin: string
}

export interface SkillExecutedPayload {
  skillId: string
  name: string
  success: boolean
  message: string
}

export interface DeviceRegisteredPayload {
  deviceId: string
  deviceType: string
  platform?: string
  status: string
}

export interface NotificationEmittedPayload {
  source: string
  title: string
  importance: 'info' | 'high' | 'critical'
}

export interface LearningCyclePayload {
  cycleId: string
  triggered: boolean
  toolCount?: number
  gapCount?: number
}

export interface EventPayloadMap {
  context_updated: ContextUpdatedPayload
  task_created: TaskCreatedPayload
  task_completed: TaskCompletedPayload
  task_failed: TaskCompletedPayload
  task_dispatched: { taskId: string; goalId?: string; priority?: number; attempts?: number }
  task_scheduled: { id: string; title: string; runAt: number }
  plan_created: PlanCreatedPayload
  plan_selected: PlanSelectedPayload
  agent_assigned: AgentAssignedPayload
  agent_completed: { taskId: string; agentId: string; success: boolean; summary: string }
  command_received: CommandReceivedPayload
  command_parsed: CommandParsedPayload
  command_routed: CommandRoutedPayload
  command_executed: CommandExecutedPayload
  memory_recorded: MemoryRecordedPayload
  memory_recalled: MemoryRecalledPayload
  memory_synced: { count: number; source: string }
  error_occurred: ErrorOccurredPayload
  runtime_started: RuntimeStartedPayload
  runtime_stopped: RuntimeStoppedPayload
  runtime_tick: RuntimeTickPayload
  vision_snapshot: { text: string; confidence: number; timestamp: number }
  prediction_generated: { prediction: { id: string; reason: string; confidence: number; suggestedAction: string } }
  reflection_ready: { reflection: { taskId: string; success: boolean; notes: string; optimization?: string; timestamp: number } }
  skill_registered: SkillRegisteredPayload
  skill_executed: SkillExecutedPayload
  device_registered: DeviceRegisteredPayload
  device_updated: DeviceRegisteredPayload
  notification_emitted: NotificationEmittedPayload
  learning_cycle_started: LearningCyclePayload
  learning_cycle_completed: LearningCyclePayload
}

export type EventListener<TName extends SystemEventName = SystemEventName> = (
  envelope: EventEnvelope<EventPayloadMap[TName]>,
) => void | Promise<void>

export type EventPattern = SystemEventName | '*' | `${string}*`

export function matchesPattern(pattern: EventPattern, eventName: SystemEventName): boolean {
  if (pattern === '*') return true
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1)
    return eventName.startsWith(prefix)
  }
  return pattern === eventName
}

export function createEnvelope<T>(
  name: SystemEventName,
  payload: T,
  options: EventDispatchOptions = {},
): EventEnvelope<T> {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    name,
    source: options.source || 'system',
    timestamp: Date.now(),
    correlationId: options.correlationId,
    causationId: options.causationId,
    payload,
    metadata: { ...(options.metadata || {}) },
  }
}