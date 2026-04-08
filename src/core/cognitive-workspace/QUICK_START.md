# Cognitive Workspace - Quick Start

## Installation

The Cognitive Workspace is deployed and ready to use. All files compile cleanly.

Located at: `src/core/cognitive-workspace/`

## Import in Any Module

```typescript
import {
  getCognitiveWorkspace,
  createWorkspaceListener,
  type CognitiveWorkspaceState,
  WorkspaceReactors,
} from '@/core/cognitive-workspace'
```

## Basic Usage

### 1. Initialize in Your Module

```typescript
const workspace = getCognitiveWorkspace()
const listener = createWorkspaceListener()
```

### 2. Read Current State

```typescript
const state = listener.getState()
console.log('Current mood:', state.emotionalState.currentMood)
console.log('Active task:', state.activeTask?.name)
console.log('Readiness:', state.readinessScore)
```

### 3. Listen for Changes

```typescript
// Listen for emotion changes
listener.onEmotionalChange((newMood, change, prevMood) => {
  console.log(`Mood changed: ${prevMood} → ${newMood}`)
  // React to emotion shift
})

// Listen for goal assignments
listener.onGoalChange((goal) => {
  if (goal) {
    console.log('New goal:', goal.description)
    // Start working on goal
  }
})

// Listen for task completion
listener.onTaskStateTransition((oldState, newState) => {
  if (newState === 'completed') {
    console.log('Task completed!')
  }
})

// Listen for system blocked
listener.onBlockersChange((blockers) => {
  if (blockers.length > 0) {
    console.log('System blocked:', blockers)
  }
})
```

### 4. Update State

```typescript
// Update state and notify subscribers
await workspace.updateState({
  source: 'MY_MODULE',
  updates: {
    emotionalState: {
      currentMood: 'excited',
      confidence: 'high',
    }
  },
  reason: 'User achieved goal'
})

// Or merge into a field
await workspace.mergeField(
  'emotionalState',
  { currentMood: 'calm' },
  'MY_MODULE',
  'User requested calm mode'
)

// Or set a single field
workspace.setField(
  'emotionalState',
  { ...state.emotionalState, currentMood: 'focused' },
  'MY_MODULE',
  'Starting focused work'
)
```

### 5. Record Decisions

```typescript
workspace.recordDecision(
  'Chose conservative approach',
  'Confidence is low and mood is uncertain, prioritizing safety',
  'low',
  ['emotionalState', 'currentGoal']
)

// Later, retrieve decisions
const recent = workspace.getRecentDecisions(10)
recent.forEach(d => console.log(d.decision, d.reasoning))
```

### 6. Get Diagnostics

```typescript
const diag = workspace.getDiagnostics()
console.log('Readiness Score:', diag.readinessScore, '/100')
console.log('Current Mood:', diag.currentMood)
console.log('Confidence:', diag.confidence)
console.log('Active Task State:', diag.activeTaskState)
console.log('Subscribers:', diag.subscriptionCount)
```

## Pre-Built Reactors

```typescript
// React to goal completion
WorkspaceReactors.onGoalCompleted((goal) => {
  console.log('Completed:', goal.description)
})

// React to high anxiety (low confidence + negative mood)
WorkspaceReactors.onHighAnxiety((state) => {
  console.log('System is anxious, taking cautious approach')
})

// React to task failures
WorkspaceReactors.onTaskFailed((task, reason) => {
  console.log('Task failed:', reason)
})

// React to system being blocked
WorkspaceReactors.onSystemBlocked((blockers) => {
  console.log('Blockers:', blockers)
})

// React when user intent becomes clear
WorkspaceReactors.onIntentClarity(0.8, (clarity) => {
  console.log('Intent is clear:', clarity)
})
```

## Cleanup

```typescript
// Get subscription ID when creating listener
const subId = listener.onEmotionalChange(...)

// Unsubscribe when done
listener.off(subId)

// Or unsubscribe from all
listener.offAll()
```

## Complete Example: Memory Engine

```typescript
import {
  getCognitiveWorkspace,
  createWorkspaceListener,
} from '@/core/cognitive-workspace'

export class MemoryEngine {
  private workspace = getCognitiveWorkspace()
  private listener = createWorkspaceListener()
  
  constructor() {
    this.setupListeners()
  }
  
  private setupListeners() {
    // Record completed tasks
    this.listener.onTaskStateTransition((_, newState) => {
      if (newState === 'completed') {
        const state = this.listener.getState()
        this.persistTask(state.activeTask)
      }
    })
    
    // Index mood patterns
    this.listener.onEmotionalChange((mood) => {
      this.recordMoodPattern(mood)
    })
    
    // Retrieve memories on goal change
    this.listener.onGoalChange(async (goal) => {
      if (goal) {
        const memories = await this.semanticSearch(goal.description)
        await this.workspace.updateState({
          source: 'MEMORY_ENGINE',
          updates: {
            memoryContext: {
              recentMemories: memories.map(m => m.id),
              semanticContext: memories,
            }
          }
        })
      }
    })
  }
  
  private persistTask(task: any) {
    // Save to database
    console.log('Persisting task:', task.name)
  }
  
  private recordMoodPattern(mood: string) {
    console.log('Recording mood:', mood)
  }
  
  private async semanticSearch(query: string) {
    // Search knowledge base
    return []
  }
}
```

## Benefits Over Direct Imports

### Before
```typescript
// Direct coupling
const memory = new MemoryEngine()
const consciousness = new ConsciousnessEngine(memory)
const voice = new VoiceOrchestrator(consciousness, memory)

// Hard to test, many dependencies to mock
```

### After
```typescript
// No coupling - all through workspace
const memory = new MemoryEngine()
const consciousness = new ConsciousnessEngine()
const voice = new VoiceOrchestrator()

// Easy to test - mock just the workspace
```

## Documentation Files

- **ARCHITECTURE_UPGRADE.md** - Full design rationale, layer stack, benefits
- **WORKSPACE_INTEGRATION_GUIDE.md** - Module-by-module integration patterns
- **REFACTORING_BLUEPRINT.md** - Detailed step-by-step guides for each orchestrator
- **DEPLOYMENT_SUMMARY.md** - Validation checklist, success criteria, timeline

## State Structure

```typescript
workspace_state = {
  // What the system perceives
  perception: {
    currentInput: string
    inputType: 'voice' | 'text' | 'event' | 'notification'
    sensoryData: { sentiment?, intensity?, clarity? }
  }
  
  // What the system is trying to achieve
  currentGoal?: {
    goalId, description, priority, confidence, steps, progress
  }
  
  // What's actively executing
  activeTask?: {
    taskId, name, state, progress, currentAction, error
  }
  
  // Relevant memories and knowledge
  memoryContext: {
    recentMemories, semanticContext, historicalPatterns
  }
  
  // Current emotional state
  emotionalState: {
    currentMood, confidence, uncertainty, energy, focusLevel,
    selfAwareness, executionStyle
  }
  
  // Predictions about what comes next
  predictions: {
    nextLikelyActions, expectedOutcome, successProbability,
    riskFactors, opportunityWindow
  }
  
  // Decision history for learning
  decisionHistory: [{decisionId, decision, reasoning, confidence}]
  
  // What's preventing progress
  blockers?: string[]
  
  // Safety/permission constraints
  activeConstraints?: string[]
}
```

## Next Steps

1. Review **REFACTORING_BLUEPRINT.md** for your module
2. Replace direct calls with workspace updates
3. Add listeners for state changes
4. Test with mocked workspace
5. Integrate into main app

The foundation is built. Ready for refactoring!
