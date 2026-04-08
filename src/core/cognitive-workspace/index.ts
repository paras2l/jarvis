/**
 * Cognitive Workspace Module
 * 
 * Central exports for the consciousness workspace system.
 * 
 * This is the Foundation of the cleaned architecture.
 * All modules read/write global state through this API.
 */

// State and types
export {
  // Types
  type CognitiveWorkspaceState,
  type PerceptionState,
  type CurrentGoal,
  type ActiveTask,
  type MemoryContext,
  type EmotionalStateData,
  type Predictions,
  type DecisionTrace,
  type WorkspaceUpdate,
  type WorkspaceSubscription,
  type WorkspaceChange,
  type EmotionalState,
  type TaskState,
  type ConfidenceLevel,
  type SituationalContext,
  // Functions
  createEmptyWorkspaceState,
  WORKSPACE_PATHS,
} from './workspace_state.ts'

// Controller (state management)
export {
  CognitiveWorkspaceController,
  getCognitiveWorkspace,
  resetCognitiveWorkspace,
} from './workspace_controller.ts'

// Subscribers (reactive patterns)
export {
  WorkspaceListener,
  createWorkspaceListener,
  getWorkspaceListener,
  WorkspaceReactors,
} from './workspace_subscribers.ts'

// Task Queue (Planning → Execution)
export {
  TaskQueueManager,
  getTaskQueue,
  resetTaskQueue,
  type QueuedTask,
  type TaskQueueConfig,
  type TaskPriority,
  type TaskStatus,
  type RetryStrategy,
} from './task_queue.ts'

// Confidence Gate (Safety checks)
export {
  ConfidenceGateManager,
  getConfidenceGate,
  resetConfidenceGate,
  type GateDecision,
  type ConfidenceGateConfig,
  type GateAction,
  type ConfidenceThreshold,
} from './confidence_gate.ts'

// Tool Registry (Dynamic tool selection)
export {
  ToolRegistryManager,
  getToolRegistry,
  resetToolRegistry,
  type Tool,
  type ToolSignature,
  type ToolCategory,
  type ToolCapability,
} from './tool_registry.ts'

// Memory Ranking (Smart recall)
export {
  MemoryRankingEngine,
  getMemoryRankingEngine,
  resetMemoryRankingEngine,
  contextToMemories,
  type RankedMemory,
  type MemoryRankingConfig,
} from './memory_ranking.ts'
