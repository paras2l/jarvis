# Cognitive Workspace Architecture Upgrade

## Problem Solved

### Before (Direct Coupling)
```
VoiceOrchestrator
  → ConsciousnessEngine
    → BrainDirector
      → TaskExecutor
        → ChatResponseEngine
          → MemoryEngine

Problems:
- ⚠️ Chain of direct dependencies
- ⚠️ Hard to test (mock entire chains)
- ⚠️ Changes in one module break downstream
- ⚠️ No global state awareness
- ⚠️ Difficult to add new modules
```

### After (Event-Bus + Global Workspace)
```
┌─────────────────────────────────────────────────────────────┐
│           GLOBAL COGNITIVE WORKSPACE                         │
│  (perception, goal, task, memory, emotion, predictions)    │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
    [Subscribe]        [Subscribe]      [Subscribe]
          │                 │                 │
    ┌─────────────────────────────────────────────────┐
    │         EVENT BUS                               │
    │  (typed events with workspace updates)          │
    └─────────────────────────────────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
    VoiceOrch    ConsciousnessEngine    TaskExecutor
         │               │                   │
         └───────────────┼───────────────────┘
                         │
                    [Publish Events]
                         │
                    (No direct calls)

Benefits:
✅ Loose coupling (publish/subscribe)
✅ Single source of truth (workspace)
✅ Parallel reactions (all modules react simultaneously)
✅ New modules add without breaking others
✅ Everything observable and debuggable
```

## Architecture Layers

```
USER INTERACTION
     ↓
┌─────────────────────────────────────────┐
│ PERCEPTION LAYER                        │
│ (voice input, text, events, sensors)   │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ WORKSPACE                               │
│ ┌───────────────────────────────────┐   │
│ │ perception                        │   │
│ │ current_goal                      │   │
│ │ active_task                       │   │
│ │ memory_context                    │   │
│ │ emotional_state                   │   │
│ │ predictions                       │   │
│ │ decision_history                  │   │
│ └───────────────────────────────────┘   │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ CONSCIOUSNESS ENGINE                    │
│ (emotion analysis, self-awareness)      │
│ [Subscribes to: perception]             │
│ [Updates: emotionalState]               │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ PLANNING LAYER                          │
│ (goal formation, step generation)       │
│ [Subscribes to: goal, emotion]          │
│ [Publishes: predictions]                │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ ACTION/EXECUTION LAYER                  │
│ (task execution, tool invocation)       │
│ [Subscribes to: activeTask]             │
│ [Updates: task progress, outcome]       │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ MEMORY LAYER                            │
│ (semantic storage, pattern finding)     │
│ [Subscribes to: decisions, tasks]       │
│ [Publishes: memory_context]             │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ REFLECTION LAYER                        │
│ (learning, uncertainty recording)       │
│ [Subscribes to: task completion, fail]  │
│ [Updates: decision_history]             │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ LEARNING LAYER                          │
│ (pattern extraction, knowledge update)  │
│ [Subscribes to: reflection events]      │
│ [Persists: to knowledge base]           │
└─────────────────────────────────────────┘
     ↓
OUTPUT (Voice, UI, Actions)
```

## Data Flow Example: Voice Command

```
1. PERCEPTION
   User says: "help me plan my week"
   ↓
   VoiceOrchestrator.updateState({
     perception: {
       currentInput: "help me plan my week",
       inputType: 'voice',
       sensoryData: { sentiment: 'curious', intensity: 0.7 }
     }
   })

2. WORKSPACE UPDATE
   Workspace processes update
   ↓
   Notify all subscribers

3. CONSCIOUSNESS REACTS
   listener.onPerceptionChange((input) => {
     // Analyze emotion
     // Assess confidence
     workspace.updateState({
       emotionalState: { currentMood: 'helpful', confidence: 'high' }
     })
   })

4. PLANNING REACTS
   listener.onEmotionalChange(() => {
     // Build plan for "planning week"
     workspace.updateState({
       currentGoal: { description: 'Plan user's week', steps: [...] }
     })
   })

5. MEMORY REACTS
   listener.onGoalChange((goal) => {
     // Retrieve past planning sessions
     workspace.updateState({
       memoryContext: { recentMemories: [...relevant...] }
     })
   })

6. EXECUTION REACTS
   listener.onGoalChange((goal) => {
     // Start task
     workspace.updateState({
       activeTask: { state: 'executing', progress: 0 }
     })
     // Execute planning steps...
   })

7. RESPONSE
   All listeners have read & updated workspace
   ↓
   Generate response based on final workspace state
   ↓
   Stream to voice/UI

Timeline: ~50-200ms, all parallel
Old architecture: ~500-1000ms (sequential calls)
```

## Module Integration Map

### Voice Orchestrator
```typescript
// OLD: Direct calls to consciousness
consciousnessEngine.analyzeEmotion(input)
taskExecutor.execute(command)

// NEW: Publish to workspace
workspace.updateState({
  source: 'VOICE_ORCHESTRATOR',
  updates: { perception: {...} }
})

// NEW: Listen to results
listener.onEmotionalChange((mood) => {
  adjustVoicePersonality(mood)
})
```

### Consciousness Engine
```typescript
// OLD: Manage own emotion state
this.currentMood = analyzeSentiment(input)

// NEW: Listen and react
listener.onPerceptionChange((input) => {
  const mood = analyzeSentiment(input)
  workspace.setField('emotionalState', { currentMood: mood })
})

// NEW: Publish decision traces
workspace.recordDecision(
  'Chose cautious approach',
  'Confidence is low',
  'low'
)
```

### Task Executor
```typescript
// OLD: Called directly by multiple modules
await taskExecutor.execute(goal)

// NEW: Passive listener
listener.onGoalChange((goal) => {
  workspace.updateState({
    activeTask: { state: 'executing' }
  })
  const result = await executeGoal(goal)
  workspace.updateState({
    activeTask: { state: result.success ? 'completed' : 'failed' }
  })
})
```

### Planning Engine
```typescript
// OLD: Called to generate plans
const plan = planner.buildPlan(goal)

// NEW: Reactive planning
listener.onGoalChange((goal) => {
  const context = listener.getState()
  const plan = buildPlan(goal, context)
  workspace.updateState({
    predictions: { nextLikelyActions: plan.steps }
  })
})
```

## Testing Benefits

### Before
```typescript
// Had to mock entire chain
const mockConsciousness = { analyze: jest.fn() }
const mockExecutor = { execute: jest.fn() }
const orchestrator = new VoiceOrch(mockConsciousness, mockExecutor)
// Still fragile, many mocks needed
```

### After
```typescript
// Just mock/spy on workspace
const workspace = getCognitiveWorkspace()
jest.spyOn(workspace, 'updateState')

orchestrator.handleInput("test")
await orchestrator.settle() // wait for async updates

expect(workspace.updateState).toHaveBeenCalledWith(
  expect.objectContaining({
    updates: { perception: {...} }
  })
)
```

## Debugging Benefits

### Before
- Difficult to trace why a decision was made
- State spread across many modules
- Hard to replay issues
- Console.logs scattered everywhere

### After
```typescript
const diagnostics = workspace.getDiagnostics()
console.log(diagnostics)
// {
//   stateSnapshot: {...},
//   currentMood: 'frustrated',
//   confidence: 'low',
//   activeTaskState: 'blocked',
//   changeHistorySize: 127
// }

// See exactly what changed and why
const history = workspace.getChangeHistory(10)
history.forEach(change => {
  console.log(`[${change.source}] ${change.reason}`)
  console.log('Changed:', change.changedPaths)
})

// See decision trace
workspace.getRecentDecisions(5)
```

## Scalability Benefits

### Adding a New Module (e.g., VoicePersonalityEngine)

**Before**: 
- Need to import VoiceOrchestrator, ConsciousnessEngine, etc.
- Add new parameters to all constructors
- Risk breaking existing modules
- Handle new direct dependencies

**After**:
```typescript
import { createWorkspaceListener, getCognitiveWorkspace } from '@/core/cognitive-workspace'

class VoicePersonalityEngine {
  private listener = createWorkspaceListener()
  private workspace = getCognitiveWorkspace()

  constructor() {
    this.setupListeners()
  }

  private setupListeners() {
    this.listener.onEmotionalChange((mood, change, prevMood) => {
      this.adaptPersonality(prevMood, mood)
    })
    
    this.listener.onTaskStateTransition((oldState, newState) => {
      this.adjustToneForTaskState(newState)
    })
  }

  private adaptPersonality(from: EmotionalState, to: EmotionalState) {
    const tone = this.computeTone(from, to)
    // Just publish back to workspace, don't call anything
    this.workspace.recordDecision(`Tone: ${tone}`, 'Emotional transition', 'high')
  }
}

// In main app.tsx:
// const personalityEngine = new VoicePersonalityEngine()
// That's it! No wiring needed, it self-subscribes and works.
```

## Transition Plan

### Phase 1: Deploy Workspace (Done)
- Create cognitive-workspace module
- Set up workspace state, controller, subscribers
- Create integration guide
- ✅ No breaking changes yet

### Phase 2: Wire Event Bus
- Make eventPublisher publish workspace updates
- Register workspace listeners in event handlers
- Keep existing direct calls (backwards compat)

### Phase 3: Refactor High-Traffic Modules
- VoiceOrchestrator: publish to workspace
- ConsciousnessEngine: subscribe to perception
- TaskExecutor: subscribe to goals

### Phase 4: Refactor Supporting Modules
- MemoryEngine
- ChatResponseEngine
- PlanningEngine
- BrainDirector

### Phase 5: Deprecate Direct Calls
- Remove direct imports between modules
- Update all event handlers to use workspace
- Full event-driven architecture

### Phase 6: Optimization
- Add state caching for hot paths
- Batch workspace updates
- Add middleware for logging/telemetry

## Key Metrics to Track

After refactoring, these should improve:
- **Module coupling**: Target 0 (fully decoupled)
- **Response latency**: Should decrease (parallel reactions)
- **Test coverage**: Should increase (easier to test)
- **Debugging time**: Should decrease (full state history)
- **New module onboarding**: Should decrease (simpler pattern)
- **Memory footprint**: Watch (global workspace + subscriptions)
