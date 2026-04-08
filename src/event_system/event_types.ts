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
  | 'action_logged'
  | 'agency_action_ready'
  | 'simulation_complete'
  | 'alignment_evaluated'
  | 'user_override_occurred'
  | 'outcome_evaluated'
  | 'feedback_integrated'
  | 'policy_update_proposed'
  | 'policy_update_deployed'
  | 'confidence_calibrated'
  | 'learning_cycle_metrics_updated'
  | 'voice_command_perceived'
  | 'screen_state_updated'
  | 'sensor_signal_detected'
  | 'perception_confidence_low'
  | 'perception_verified'
  | 'action_feedback_logged'
  | 'voice_personality_decided'
  | 'voice_personality_anomaly'
  | 'voice_personality_tuning_updated'
  | 'consciousness_metric'
  | 'consciousness_emotion_shift'
  | 'consciousness_learning_recorded'
  | 'hotword_detected'
  | 'sentiment_analyzed'
  | 'command_matched'
  | 'custom_command_added'

export interface OutcomeEvaluatedPayload {
  evaluationId: string
  actionId: string
  success: boolean
  predictionAccuracy: number
  deviationScore: number
  successRate: number
  efficiency: number
}

export interface FeedbackIntegratedPayload {
  actionId: string
  feedbackType: 'approval' | 'rejection' | 'correction' | 'optimization' | 'safety_flag'
  source: 'user_explicit' | 'user_implicit' | 'environment' | 'system_monitor'
  feedbackScore: number
  intensity: number
}

export interface PolicyUpdateProposedPayload {
  updateId: string
  policyName: string
  updateType: 'threshold_adjustment' | 'pattern_promotion' | 'pattern_suppression' | 'strategy_refinement'
  confidence: number
  estimatedSuccessRateChange: number
}

export interface PolicyUpdateDeployedPayload {
  updateId: string
  policyName: string
  previousValue: number | string
  newValue: number | string
  deploymentTime: number
}

export interface ConfidenceCalibratedPayload {
  moduleId: string
  actionType?: 'reactive' | 'proactive' | 'exploratory'
  previousConfidence: number
  adjustedConfidence: number
  historicalAccuracy: number
  sampleSize: number
}

export interface LearningCycleMetricsUpdatedPayload {
  cycleNumber: number
  duration: number
  outcomeEvaluations: number
  feedbackSignals: number
  policiesRefined: number
  confidenceAdjustments: number
  detectedPatterns: number
  systemConfidence: number
  successRate: number
  averageEfficiency: number
}

export interface VoiceCommandPerceivedPayload {
  commandId: string
  originalText: string
  normalizedText: string
  intent: string
  confidence: number
  requiresVerification: boolean
}

export interface ScreenStateUpdatedPayload {
  snapshotId: string
  focusedApp?: string
  focusedWindowTitle?: string
  runningApps: string[]
  windowCount: number
  confidence: number
}

export interface SensorSignalDetectedPayload {
  signalId: string
  channel: 'notification' | 'system_alert' | 'microphone' | 'camera' | 'peripheral' | 'network'
  level: 'info' | 'warning' | 'critical'
  message: string
  confidence: number
}

export interface PerceptionConfidenceLowPayload {
  channel: 'voice' | 'screen' | 'sensor' | 'cross_modal'
  confidence: number
  reason: string
  clarificationPrompt: string
}

export interface PerceptionVerifiedPayload {
  cycleId: string
  aggregateConfidence: number
  requiresVerification: boolean
  channels: {
    voice: number
    screen: number
    sensor: number
  }
}

export interface ActionFeedbackLoggedPayload {
  actionId: string
  success: boolean
  summary: string
  source: string
}

export interface VoicePersonalityDecidedPayload {
  userName: string
  commandPreview: string
  intent?: string
  confidence?: number
  activePersonality: string
  preferredPersonality: string
  autoPersonalityEnabled: boolean
  safetyModeEnabled: boolean
  reason: string
  spectrumSentiment: 'tired' | 'excited' | 'focused' | 'neutral'
  lockRemainingMs: number
  manualLockRemainingMs: number
  scores: Record<string, number>
}

export interface VoicePersonalityAnomalyPayload {
  userName: string
  anomalyType: 'high_churn' | 'rapid_switching'
  switchCount: number
  decisions: number
  churnPerMinute: number
  stabilizationWindowMs: number
  recentReasons: string[]
}

export interface VoicePersonalityTuningUpdatedPayload {
  userName: string
  reason: 'anomaly_response' | 'stability_optimization' | 'manual_reset'
  churnSwitchThreshold: number
  stabilizationWindowMs: number
  anomalyCount: number
  recoveryCount: number
  updatedAt: number
}

export interface ConsciousnessMetricPayload {
  userId: string
  metric: 'emotion_shift' | 'learning_recorded' | 'uncertainty_acknowledged'
  consciousness: string
  currentMood: string
  timestamp: number
}

export interface ConsciousnessEmotionShiftPayload {
  userId: string
  fromMood: string
  toMood: string
  context: string
  timestamp: number
}

export interface ConsciousnessLearningRecordedPayload {
  userId: string
  interaction: string
  recentLearningCount: number
  timestamp: number
}

export interface HotwordDetectedPayload {
  keyword: string
  userId: string
  timestamp: number
  confidence?: number
}

export interface SentimentAnalyzedPayload {
  userId: string
  text: string
  emotion: string
  sentiment: string
  score: number
  keywords: string[]
  intensityLevel: string
  explanation: string
  timestamp: number
}

export interface CommandMatchedPayload {
  userId: string
  command: string
  matchedCommand: string
  confidence: number
  source: 'local' | 'api' | 'hybrid'
  timestamp: number
}

export interface CustomCommandAddedPayload {
  userId: string
  name: string
  pattern: string
  action: string
  description: string
  commandId?: string
  timestamp: number
}
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
    selfAwarenessReport?: {
      overallScore: number
      overallPercentage: number
      phaseReports: Array<{
        phase: 'belief' | 'goal' | 'execution' | 'reflection' | 'governance'
        score: number
        percentage: number
        weight: number
        summary: string
      }>
      completedPhases: number
      phaseCount: number
      strongestPhase: 'belief' | 'goal' | 'execution' | 'reflection' | 'governance'
      weakestPhase: 'belief' | 'goal' | 'execution' | 'reflection' | 'governance'
      gapPercentage: number
      status: 'forming' | 'integrated' | 'strong' | 'mature'
      narrative: string
      updatedAt: number
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

export interface ActionLoggedPayload {
  actionId: string
  description: string
  type: 'reactive' | 'proactive'
  confidence: number
  utility: number
  timestamp: number
}

export interface AgencyActionReadyPayload {
  actionId: string
  description: string
  confidence: number
  utility: number
}

export interface SimulationCompletePayload {
  simulationId: string
  actionId: string
  approved: boolean
  overallRisk: number
  overallUtility: number
  recommendationScore: number
}

export interface AlignmentEvaluatedPayload {
  actionId: string
  decision: 'approved' | 'modified' | 'blocked'
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  violatedPolicies: string[]
  confidence: number
}

export interface UserOverrideOccurredPayload {
  actionId: string
  originalDecision: 'approved' | 'modified' | 'blocked'
  userDecision: 'approved' | 'modified' | 'blocked'
  reason: string
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
  action_logged: ActionLoggedPayload
  agency_action_ready: AgencyActionReadyPayload
  simulation_complete: SimulationCompletePayload
  alignment_evaluated: AlignmentEvaluatedPayload
  user_override_occurred: UserOverrideOccurredPayload
  outcome_evaluated: OutcomeEvaluatedPayload
  feedback_integrated: FeedbackIntegratedPayload
  policy_update_proposed: PolicyUpdateProposedPayload
  policy_update_deployed: PolicyUpdateDeployedPayload
  confidence_calibrated: ConfidenceCalibratedPayload
  learning_cycle_metrics_updated: LearningCycleMetricsUpdatedPayload
  voice_command_perceived: VoiceCommandPerceivedPayload
  screen_state_updated: ScreenStateUpdatedPayload
  sensor_signal_detected: SensorSignalDetectedPayload
  perception_confidence_low: PerceptionConfidenceLowPayload
  perception_verified: PerceptionVerifiedPayload
  action_feedback_logged: ActionFeedbackLoggedPayload
  voice_personality_decided: VoicePersonalityDecidedPayload
  voice_personality_anomaly: VoicePersonalityAnomalyPayload
  voice_personality_tuning_updated: VoicePersonalityTuningUpdatedPayload
  consciousness_metric: ConsciousnessMetricPayload
  consciousness_emotion_shift: ConsciousnessEmotionShiftPayload
  consciousness_learning_recorded: ConsciousnessLearningRecordedPayload
  hotword_detected: HotwordDetectedPayload
  sentiment_analyzed: SentimentAnalyzedPayload
  command_matched: CommandMatchedPayload
  custom_command_added: CustomCommandAddedPayload
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