import { eventBus } from './event_bus'
import type {
  AgentAssignedPayload,
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
  SkillExecutedPayload,
  SkillRegisteredPayload,
  SystemEventName,
  TaskCompletedPayload,
  TaskCreatedPayload,
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
}

export const eventPublisher = new EventPublisher()
