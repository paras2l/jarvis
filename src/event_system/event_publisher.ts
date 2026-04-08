import { eventBus } from './event_bus'
import type {
  ActionLoggedPayload,
  AgencyActionReadyPayload,
  AgentAssignedPayload,
  AlignmentEvaluatedPayload,
  CommandExecutedPayload,
  CommandParsedPayload,
  CommandReceivedPayload,
  CommandRoutedPayload,
  ContextUpdatedPayload,
  DeviceRegisteredPayload,
  ErrorOccurredPayload,
  LearningCyclePayload,
  MemoryRecordedPayload,
  MemoryRecalledPayload,
  NotificationEmittedPayload,
  PlanCreatedPayload,
  PlanSelectedPayload,
  RuntimeStartedPayload,
  RuntimeStoppedPayload,
  RuntimeTickPayload,
  SimulationCompletePayload,
  SkillExecutedPayload,
  SkillRegisteredPayload,
  SystemEventName,
  TaskCompletedPayload,
  TaskCreatedPayload,
  UserOverrideOccurredPayload,
  OutcomeEvaluatedPayload,
  FeedbackIntegratedPayload,
  PolicyUpdateProposedPayload,
  PolicyUpdateDeployedPayload,
  ConfidenceCalibratedPayload,
  LearningCycleMetricsUpdatedPayload,
  VoiceCommandPerceivedPayload,
  ScreenStateUpdatedPayload,
  SensorSignalDetectedPayload,
  PerceptionConfidenceLowPayload,
  PerceptionVerifiedPayload,
  ActionFeedbackLoggedPayload,
  CommandMatchedPayload,
  VoicePersonalityDecidedPayload,
  VoicePersonalityAnomalyPayload,
  VoicePersonalityTuningUpdatedPayload,
  ConsciousnessMetricPayload,
  ConsciousnessEmotionShiftPayload,
  ConsciousnessLearningRecordedPayload,
  HotwordDetectedPayload,
  SentimentAnalyzedPayload,
  CustomCommandAddedPayload,
} from './event_types'

class EventPublisher {
  publish<T>(name: SystemEventName, payload: T, source = 'system', metadata: Record<string, unknown> = {}) {
    return eventBus.publish(name, payload as never, { source, metadata })
  }

  runtimeStarted(payload: RuntimeStartedPayload, source = 'runtime') {
    return this.publish('runtime_started', payload, source)
  }

  runtimeStopped(payload: RuntimeStoppedPayload, source = 'runtime') {
    return this.publish('runtime_stopped', payload, source)
  }

  runtimeTick(payload: RuntimeTickPayload, source = 'runtime') {
    return this.publish('runtime_tick', payload, source)
  }

  contextUpdated(payload: ContextUpdatedPayload, source = 'context') {
    return this.publish('context_updated', payload, source)
  }

  planCreated(payload: PlanCreatedPayload, source = 'planner') {
    return this.publish('plan_created', payload, source)
  }

  planSelected(payload: PlanSelectedPayload, source = 'world_model') {
    return this.publish('plan_selected', payload, source)
  }

  agentAssigned(payload: AgentAssignedPayload, source = 'orchestrator') {
    return this.publish('agent_assigned', payload, source)
  }

  taskCreated(payload: TaskCreatedPayload, source = 'planner') {
    return this.publish('task_created', payload, source)
  }

  taskCompleted(payload: TaskCompletedPayload, source = 'agent') {
    return this.publish('task_completed', payload, source)
  }

  taskFailed(payload: TaskCompletedPayload, source = 'agent') {
    return this.publish('task_failed', payload, source)
  }

  commandReceived(payload: CommandReceivedPayload, source = 'uci') {
    return this.publish('command_received', payload, source)
  }

  commandParsed(payload: CommandParsedPayload, source = 'uci') {
    return this.publish('command_parsed', payload, source)
  }

  commandRouted(payload: CommandRoutedPayload, source = 'uci') {
    return this.publish('command_routed', payload, source)
  }

  commandExecuted(payload: CommandExecutedPayload, source = 'uci') {
    return this.publish('command_executed', payload, source)
  }

  memoryRecorded(payload: MemoryRecordedPayload, source = 'memory') {
    return this.publish('memory_recorded', payload, source)
  }

  memoryRecalled(payload: MemoryRecalledPayload, source = 'memory') {
    return this.publish('memory_recalled', payload, source)
  }

  errorOccurred(payload: ErrorOccurredPayload, source = 'system') {
    return this.publish('error_occurred', payload, source)
  }

  skillRegistered(payload: SkillRegisteredPayload, source = 'skills') {
    return this.publish('skill_registered', payload, source)
  }

  skillExecuted(payload: SkillExecutedPayload, source = 'skills') {
    return this.publish('skill_executed', payload, source)
  }

  deviceRegistered(payload: DeviceRegisteredPayload, source = 'devices') {
    return this.publish('device_registered', payload, source)
  }

  notificationEmitted(payload: NotificationEmittedPayload, source = 'notifications') {
    return this.publish('notification_emitted', payload, source)
  }

  learningCycleStarted(payload: LearningCyclePayload, source = 'learning') {
    return this.publish('learning_cycle_started', payload, source)
  }

  learningCycleCompleted(payload: LearningCyclePayload, source = 'learning') {
    return this.publish('learning_cycle_completed', payload, source)
  }

  taskScheduled(id: string, title: string, runAt: number, source = 'scheduler') {
    return this.publish('task_scheduled', { id, title, runAt }, source)
  }

  actionLogged(payload: ActionLoggedPayload, source = 'intentional-agency') {
    return this.publish('action_logged', payload, source)
  }

  agencyActionReady(payload: AgencyActionReadyPayload, source = 'intentional-agency') {
    return this.publish('agency_action_ready', payload, source)
  }

  simulationComplete(payload: SimulationCompletePayload, source = 'counterfactual-world') {
    return this.publish('simulation_complete', payload, source)
  }

  alignmentEvaluated(payload: AlignmentEvaluatedPayload, source = 'alignment-layer') {
    return this.publish('alignment_evaluated', payload, source)
  }

  userOverrideOccurred(payload: UserOverrideOccurredPayload, source = 'alignment-layer') {
    return this.publish('user_override_occurred', payload, source)
  }

  outcomeEvaluated(payload: OutcomeEvaluatedPayload, source = 'reflective-learning') {
    return this.publish('outcome_evaluated', payload, source)
  }

  feedbackIntegrated(payload: FeedbackIntegratedPayload, source = 'reflective-learning') {
    return this.publish('feedback_integrated', payload, source)
  }

  policyUpdateProposed(payload: PolicyUpdateProposedPayload, source = 'reflective-learning') {
    return this.publish('policy_update_proposed', payload, source)
  }

  policyUpdateDeployed(payload: PolicyUpdateDeployedPayload, source = 'reflective-learning') {
    return this.publish('policy_update_deployed', payload, source)
  }

  confidenceCalibrated(payload: ConfidenceCalibratedPayload, source = 'reflective-learning') {
    return this.publish('confidence_calibrated', payload, source)
  }

  learningCycleMetricsUpdated(payload: LearningCycleMetricsUpdatedPayload, source = 'reflective-learning') {
    return this.publish('learning_cycle_metrics_updated', payload, source)
  }

  voiceCommandPerceived(payload: VoiceCommandPerceivedPayload, source = 'perception-layer') {
    return this.publish('voice_command_perceived', payload, source)
  }

  screenStateUpdated(payload: ScreenStateUpdatedPayload, source = 'perception-layer') {
    return this.publish('screen_state_updated', payload, source)
  }

  sensorSignalDetected(payload: SensorSignalDetectedPayload, source = 'perception-layer') {
    return this.publish('sensor_signal_detected', payload, source)
  }

  perceptionConfidenceLow(payload: PerceptionConfidenceLowPayload, source = 'perception-layer') {
    return this.publish('perception_confidence_low', payload, source)
  }

  perceptionVerified(payload: PerceptionVerifiedPayload, source = 'perception-layer') {
    return this.publish('perception_verified', payload, source)
  }

  actionFeedbackLogged(payload: ActionFeedbackLoggedPayload, source = 'perception-layer') {
    return this.publish('action_feedback_logged', payload, source)
  }

  voicePersonalityDecided(payload: VoicePersonalityDecidedPayload, source = 'voice-orchestrator') {
    return this.publish('voice_personality_decided', payload, source)
  }

  voicePersonalityAnomaly(payload: VoicePersonalityAnomalyPayload, source = 'voice-orchestrator') {
    return this.publish('voice_personality_anomaly', payload, source)
  }

  voicePersonalityTuningUpdated(payload: VoicePersonalityTuningUpdatedPayload, source = 'voice-orchestrator') {
    return this.publish('voice_personality_tuning_updated', payload, source)
  }

  consciousnessMetric(payload: ConsciousnessMetricPayload, source = 'consciousness-engine') {
    return this.publish('consciousness_metric', payload, source)
  }

  consciousnessEmotionShift(payload: ConsciousnessEmotionShiftPayload, source = 'consciousness-engine') {
    return this.publish('consciousness_emotion_shift', payload, source)
  }

  consciousnessLearningRecorded(payload: ConsciousnessLearningRecordedPayload, source = 'consciousness-engine') {
    return this.publish('consciousness_learning_recorded', payload, source)
  }

  hotwordDetected(payload: HotwordDetectedPayload, source = 'voice-orchestrator') {
    return this.publish('hotword_detected', payload, source)
  }

  sentimentAnalyzed(payload: SentimentAnalyzedPayload, source = 'voice-orchestrator') {
    return this.publish('sentiment_analyzed', payload, source)
  }

  commandMatched(payload: CommandMatchedPayload, source = 'voice-orchestrator') {
    return this.publish('command_matched', payload, source)
  }

  customCommandAdded(payload: CustomCommandAddedPayload, source = 'voice-orchestrator') {
    return this.publish('custom_command_added', payload, source)
  }
}

export const eventPublisher = new EventPublisher()
