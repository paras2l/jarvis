# Cognitive Workspace Refactoring Guide

This guide shows the exact steps to refactor each module from direct-communication to workspace-driven event architecture.

## Module 1: Consciousness Engine

### Current State (Problematic)
```typescript
// src/core/consciousness/consciousness_engine.ts

export class ConsciousnessEngine {
  private currentMood: EmotionalState = 'calm'
  private confidence: ConfidenceLevel = 'unknown'
  private emotions: Map<string, EmotionalState> = new Map()
  
  // Direct method calls from other modules
  analyzeEmotion(input: string): EmotionalState {
    // ... analysis logic
    this.currentMood = newMood
    return newMood
  }
  
  recordLearning(event: string, outcome: string) {
    // Keeps internal memory
    this.learningHistory.push({...})
  }
}

// In other modules:
const mood = consciousnessEngine.analyzeEmotion(input) // Direct call
consciousnessEngine.recordLearning(...) // Direct call
```

**Problems:**
- State duplicated (consciousness maintains its own + workspace might have different state)
- No visibility into why changes happened
- Hard to test (must mock entire engine)
- Other modules tightly coupled to consciousness interface

### Target State (Event-Driven)
```typescript
// src/core/consciousness/consciousness_engine.ts

import { getCognitiveWorkspace, createWorkspaceListener } from '@/core/cognitive-workspace'
import { eventPublisher } from '@/event_system'

export class ConsciousnessEngine {
  private workspace = getCognitiveWorkspace()
  private listener = createWorkspaceListener()
  
  constructor() {
    this.setupListeners()
  }
  
  // LISTEN for perception changes instead of being called
  private setupListeners() {
    this.listener.onPerceptionChange(async (input, change) => {
      const emotion = this.analyzeEmotion(input)
      const confidence = this.assessConfidence(input)
      
      // UPDATE workspace directly (not internal state)
      await this.workspace.updateState({
        source: 'CONSCIOUSNESS_ENGINE',
        updates: {
          emotionalState: {
            currentMood: emotion,
            confidence: confidence,
            uncertainty: this.calculateUncertainty(input),
            energy: 0.5, // computed
            focusLevel: 0.7, // computed
            selfAwareness: 'high',
            executionStyle: 'balanced',
          }
        },
        reason: `Analyzed perception: "${input}"`,
      })
      
      // PUBLISH event for subscribers
      eventPublisher.emit('consciousness:emotion_changed', {
        previousMood: change.previousValues.emotionalState?.currentMood,
        newMood: emotion,
        confidence,
      })
    })
    
    // LISTEN for goal changes to assess confidence in new context
    this.listener.onGoalChange((goal) => {
      if (goal) {
        const assessedConfidence = this.assessGoalConfidence(goal)
        this.workspace.mergeField(
          'emotionalState',
          { confidence: assessedConfidence },
          'CONSCIOUSNESS_ENGINE',
          `Reassessed confidence for goal: ${goal.description}`
        )
      }
    })
    
    // LISTEN for task completion to record learning
    this.listener.onTaskStateTransition((oldState, newState) => {
      if (newState === 'completed') {
        const state = this.listener.getState()
        this.workspace.recordDecision(
          `Task completed successfully`,
          `Execution strategy: balanced, confidence was ${state.emotionalState.confidence}`,
          'high',
          ['activeTask', 'emotionalState']
        )
      } else if (newState === 'failed') {
        const state = this.listener.getState()
        this.workspace.recordDecision(
          `Task failed`,
          state.activeTask?.error || 'Unknown error',
          'low',
          ['activeTask']
        )
      }
    })
  }
  
  // Private analysis methods (unchanged logic)
  private analyzeEmotion(input: string): EmotionalState {
    // Same logic, but output doesn't update internal state anymore
    // Returns computed value that gets pushed to workspace
    // ...
  }
  
  private assessConfidence(input: string): ConfidenceLevel {
    // ...
  }
  
  private calculateUncertainty(input: string): number {
    // ...
  }
  
  private assessGoalConfidence(goal: any): ConfidenceLevel {
    // ...
  }
}

// Other modules now do:
const listener = createWorkspaceListener()
listener.onEmotionalChange((newMood, change, prevMood) => {
  // React to mood change
  // NO direct call to consciousness engine
})
```

**Benefits:**
- Single source of truth (workspace)
- All changes tracked with reasoning
- Modules don't call each other directly
- Easy to test: mock workspace instead of engine
- Observable: see change history

### Migration Steps for ConsciousnessEngine

1. **Add workspace imports**
   ```typescript
   import { getCognitiveWorkspace, createWorkspaceListener } from '@/core/cognitive-workspace'
   ```

2. **Add constructor with listener setup**
   ```typescript
   constructor() {
     this.workspace = getCognitiveWorkspace()
     this.listener = createWorkspaceListener()
     this.setupListeners()
   }
   ```

3. **Move analysis logic to listeners**
   - Find `analyzeEmotion()` calls in code
   - Move to `listener.onPerceptionChange()`
   - Update workspace instead of setting `this.currentMood`

4. **Replace state mutations**
   - `this.currentMood = newMood` → `workspace.setField('emotionalState', {'currentMood': newMood})`
   - `this.learningHistory.push(...)` → `workspace.recordDecision(...)`

5. **Remove direct access methods**
   - Delete `getCurrentMood()` → Use `listener.getState().emotionalState.currentMood`
   - Delete `getHistory()` → Use `workspace.getRecentDecisions()`

---

## Module 2: Voice Orchestrator

### Current State (Problematic)
```typescript
// src/voice/voice-assistant-orchestrator.ts

export class VoiceAssistantOrchestrator {
  private consciousnessEngine: ConsciousnessEngine
  private taskExecutor: TaskExecutor
  
  constructor(consciousness: ConsciousnessEngine, executor: TaskExecutor) {
    this.consciousnessEngine = consciousness
    this.taskExecutor = executor
  }
  
  async handleVoiceCommand(text: string, mood?: string) {
    try {
      // Direct call to consciousness
      const emotion = this.consciousnessEngine.analyzeEmotion(text)
      
      // Direct call to executor
      const result = await this.taskExecutor.execute({
        command: text,
        mood: emotion,
      })
      
      // Direct state update
      this.currentResponse = generateResponse(emotion, result)
      return this.currentResponse
      
    } catch (error) {
      this.lastError = error
    }
  }
}

// Other modules have no visibility
// Difficult to test (must mock consciousness + executor)
// Voice orchestrator is the bottleneck
```

### Target State (Event-Driven)
```typescript
// src/voice/voice-assistant-orchestrator.ts

import {
  getCognitiveWorkspace,
  createWorkspaceListener,
  type CognitiveWorkspaceState,
} from '@/core/cognitive-workspace'
import { eventPublisher } from '@/event_system'

export class VoiceAssistantOrchestrator {
  private workspace = getCognitiveWorkspace()
  private listener = createWorkspaceListener()
  
  constructor() {
    this.setupListeners()
  }
  
  private setupListeners() {
    // Listen for consciousness to be ready
    this.listener.onChange((state, change) => {
      if (change.source === 'CONSCIOUSNESS_ENGINE' && 
          change.changedPaths.includes('emotionalState')) {
        // Consciousness has analyzed and updated state
        // Now adapt voice based on new emotional state
        this.adaptVoicePersonality(state.emotionalState)
        
        // Publish for downstream (task execution)
        eventPublisher.emit('voice:personality_adapted', {
          mood: state.emotionalState.currentMood,
        })
      }
    })
    
    // Listen for task execution to be ready
    this.listener.onTaskChange((task, change) => {
      if (task?.state === 'completed') {
        // Task is done, generate response
        const response = this.generateResponse(
          this.listener.getState().emotionalState,
          task
        )
        eventPublisher.emit('voice:response_ready', { response })
      } else if (task?.state === 'failed') {
        // Task failed, empathetic response
        const response = this.generateEmpathyResponse(task.error)
        eventPublisher.emit('voice:error_response', { response })
      }
    })
  }
  
  async handleVoiceCommand(text: string) {
    // Step 1: Update perception (don't analyze directly)
    await this.workspace.updateState({
      source: 'VOICE_ORCHESTRATOR',
      updates: {
        perception: {
          currentInput: text,
          inputType: 'voice',
          timestamp: Date.now(),
          sensoryData: {
            sentiment: this.quickSentimentCheck(text),
            intensity: await this.getAudioIntensity(),
          }
        }
      },
      reason: 'Voice command received',
    })
    
    // Step 2: Publish event
    // Consciousness engine subscribes and will update emotionalState
    eventPublisher.emit('voice:input_received', { text })
    
    // Step 3: Wait for consciousness analysis to complete
    // (it will publish consciousness:emotion_changed)
    
    // Step 4: Don't call taskExecutor directly!
    // Instead, let event listeners handle it
    // When emotionalState is updated, other listeners react
    
    // Step 5: Return pending (actual response comes async through event)
    return { status: 'processing', id: Date.now() }
  }
  
  private adaptVoicePersonality(emotionalState: EmotionalStateData) {
    const tone = this.selectToneForMood(emotionalState.currentMood)
    const energy = emotionalState.energy
    sync({ tone, energy })
  }
  
  private generateResponse(emotion: EmotionalStateData, task: any): string {
    // Use emotion data to pick right phrasing
    if (emotion.confidence === 'low') {
      return this.pickUncertainResponse()
    }
    // ... more logic
  }
}
```

**Benefits:**
- No direct dependencies on consciousness or executor
- Perception published, others react independently
- Voice personality adapts in real-time
- Responses are context-aware
- Easy to modify without breaking other modules

### Migration Steps for VoiceOrchestrator

1. **Remove hard dependencies**
   ```typescript
   // Remove constructor params
   // OLD: constructor(consciousness, executor)
   // NEW: constructor()
   ```

2. **Add workspace/listener setup**
   ```typescript
   private workspace = getCognitiveWorkspace()
   private listener = createWorkspaceListener()
   ```

3. **Replace direct analysis calls**
   ```typescript
   // OLD:
   const emotion = consciousnessEngine.analyzeEmotion(text)
   
   // NEW:
   await workspace.updateState({
     updates: { perception: { currentInput: text, ... } }
   })
   eventPublisher.emit('voice:input_received', { text })
   ```

4. **Replace direct executor calls**
   ```typescript
   // OLD:
   const result = await taskExecutor.execute(command)
   
   // NEW:
   listener.onEmotionalChange((mood) => {
     // Consciousness has processed
     workspace.updateState({ currentGoal: {...} })
   })
   ```

5. **Move response generation to listeners**
   - Responses generated when tasks complete
   - Use emotional state from workspace
   - Publish events for output layer

---

## Module 3: Task Executor

### Current State (Problematic)
```typescript
// src/core/task_executor.ts

export class TaskExecutor {
  async execute(task: Task) {
    // Called from multiple places
    // No visibility into request source
    // No coordination with other systems
    
    try {
      const result = await runTask(task)
      return result
    } catch (e) {
      // Who knows if caller is listening?
    }
  }
  
  // No state management
  // No learning from past tasks
}
```

### Target State (Event-Driven)
```typescript
// src/core/task_executor.ts

import {
  getCognitiveWorkspace,
  createWorkspaceListener,
} from '@/core/cognitive-workspace'
import { eventPublisher } from '@/event_system'

export class TaskExecutor {
  private workspace = getCognitiveWorkspace()
  private listener = createWorkspaceListener()
  
  constructor() {
    this.setupListeners()
  }
  
  private setupListeners() {
    // Listen for goal assignments
    this.listener.onGoalChange(async (goal, change) => {
      if (!goal) return
      
      // Acknowledge receipt
      await this.workspace.updateState({
        source: 'TASK_EXECUTOR',
        updates: {
          activeTask: {
            taskId: goal.goalId,
            name: goal.description,
            state: 'planning' as const,
            progress: 0,
            startTime: Date.now(),
            canBeInterrupted: true,
          }
        },
        reason: `Started executing goal: ${goal.description}`,
      })
      
      // Execute
      try {
        const result = await this.executeGoal(goal)
        
        await this.workspace.updateState({
          source: 'TASK_EXECUTOR',
          updates: {
            activeTask: {
              state: 'completed' as const,
              progress: 100,
              outputContext: result,
            }
          },
          reason: `Successfully completed: ${goal.description}`,
        })
        
        eventPublisher.emit('task:completed', {
          goalId: goal.goalId,
          result,
        })
        
      } catch (error) {
        await this.workspace.updateState({
          source: 'TASK_EXECUTOR',
          updates: {
            activeTask: {
              state: 'failed' as const,
              error: error.message,
            }
          },
          reason: `Task failed: ${error.message}`,
        })
        
        eventPublisher.emit('task:failed', {
          goalId: goal.goalId,
          error: error.message,
        })
      }
    })
    
    // Listen for interruption requests
    this.listener.onBlockersChange((blockers) => {
      if (blockers.includes('user_interrupt')) {
        const task = this.listener.getState().activeTask
        if (task?.canBeInterrupted) {
          this.abortCurrentTask()
        }
      }
    })
  }
  
  private async executeGoal(goal: any): Promise<any> {
    // State visible at every step
    // Progress updated to workspace
    // Other modules see in real-time
    
    const steps = goal.steps || []
    for (let i = 0; i < steps.length; i++) {
      const progress = Math.round((i / steps.length) * 100)
      
      await this.workspace.mergeField(
        'activeTask',
        {
          progress,
          currentAction: steps[i],
        },
        'TASK_EXECUTOR',
        `Executing step ${i + 1}/${steps.length}`
      )
      
      const result = await executeStep(steps[i])
      if (!result.success) {
        throw new Error(`Step ${i + 1} failed: ${result.error}`)
      }
    }
    
    return { success: true, results: [...] }
  }
  
  private abortCurrentTask() {
    this.workspace.updateState({
      source: 'TASK_EXECUTOR',
      updates: {
        activeTask: {
          state: 'failed' as const,
          error: 'Interrupted by user',
        }
      },
      reason: 'User requested interruption',
    })
  }
}
```

### Migration Steps for TaskExecutor

1. **Remove direct execute() calls**
   - Instead of being called, listen for goal assignments
   
2. **Replace state with workspace updates**
   - `this.currentTask` → `workspace.setField('activeTask', ...)`
   - Progress updates → `workspace.mergeField('activeTask', { progress: ... })`

3. **Publish completion events**
   - `eventPublisher.emit('task:completed', ...)`
   - `eventPublisher.emit('task:failed', ...)`

4. **Listen for interruption**
   - `listener.onBlockersChange()` for user interrupts
   - `listener.onConstraintsChange()` for resource constraints

---

## Module 4: Planning Engine

### Migration Pattern

```typescript
import { getCognitiveWorkspace, createWorkspaceListener } from '@/core/cognitive-workspace'

export class PlanningEngine {
  private workspace = getCognitiveWorkspace()
  private listener = createWorkspaceListener()
  
  constructor() {
    // Listen for new goals to plan
    this.listener.onGoalChange(async (goal, change) => {
      if (!goal) return
      
      // Use full workspace context
      const state = this.listener.getState()
      const context = {
        recentMemories: state.memoryContext.recentMemories,
        currentMood: state.emotionalState.currentMood,
        confidence: state.emotionalState.confidence,
        constraints: state.activeConstraints || [],
      }
      
      // Generate plan
      const plan = await this.generatePlan(goal, context)
      
      // Publish predictions
      await this.workspace.updateState({
        source: 'PLANNING_ENGINE',
        updates: {
          predictions: {
            nextLikelyActions: plan.steps,
            successProbability: plan.confidence,
            predictedChallenges: plan.risks,
            opportunityWindow: plan.timeLimit,
          }
        },
        reason: `Planned approach for: ${goal.description}`,
      })
    })
  }
  
  private async generatePlan(goal: any, context: any): Promise<any> {
    // Use context from workspace, not passed parameters
    // Now planning is context-aware: mood affects caution level, confidence affects boldness
    // ...
  }
}
```

---

## Module 5: Memory Engine

### Migration Pattern

```typescript
export class MemoryEngine {
  private workspace = getCognitiveWorkspace()
  private listener = createWorkspaceListener()
  
  constructor() {
    // Record decisions
    this.listener.onFieldChange(['decisionHistory'], async (state) => {
      const recentDecisions = state.decisionHistory.slice(-5)
      await this.persistToDatabase(recentDecisions)
    })
    
    // Record emotional patterns
    this.listener.onEmotionalChange(async (mood) => {
      await this.recordMoodPattern(mood)
    })
    
    // Index completed tasks
    this.listener.onTaskStateTransition((oldState, newState) => {
      if (newState === 'completed') {
        const state = this.listener.getState()
        this.indexTaskForRetrieval(state.activeTask)
      }
    })
    
    // Retrieve context when goals change
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
}
```

---

## Validation Checklist

After refactoring each module:

- [ ] No direct imports of other orchestrators/engines
- [ ] All state updates go through workspace
- [ ] All state reads come from listener.getState()
- [ ] Events published for every important change
- [ ] Listeners set up in constructor
- [ ] No async/timing dependencies (rely on event ordering)
- [ ] Compile errors checked with `get_errors()`
- [ ] Change history logged for debugging
- [ ] No console.logs hard-coded (use decision traces)

---

## Testing Pattern

### Before Refactoring
```typescript
it('should analyze emotion and execute task', () => {
  const mockConsciousness = { analyzeEmotion: jest.fn() }
  const mockExecutor = { execute: jest.fn() }
  const orch = new VoiceOrch(mockConsciousness, mockExecutor)
  
  orch.handleVoiceCommand('test')
  
  expect(mockConsciousness.analyzeEmotion).toHaveBeenCalled()
  expect(mockExecutor.execute).toHaveBeenCalled()
})
```

### After Refactoring
```typescript
it('should publish perception to workspace', () => {
  const workspace = getCognitiveWorkspace()
  jest.spyOn(workspace, 'updateState')
  
  const orch = new VoiceOrch()
  orch.handleVoiceCommand('test')
  
  expect(workspace.updateState).toHaveBeenCalledWith(
    expect.objectContaining({
      source: 'VOICE_ORCHESTRATOR',
      updates: expect.objectContaining({
        perception: expect.any(Object)
      })
    })
  )
})
```

Much simpler!

---

## Rollback Plan

If something breaks during refactoring:

1. Keep old `execute()` methods as aliases
2. Both direct calls AND workspace updates work in parallel
3. Gradually deprecate direct calls
4. Full cutover only after extensive testing

```typescript
// Temporary bridge during transition
async execute(task: Task) {
  // New way: update workspace
  await workspace.updateState({ activeTask: {...} })
  
  // Also return result for backwards compat
  return await this.executeGoalInternal(task)
}
```

---

## Timeline

- **Phase 1**: Consciousness Engine (2 hours) - Core of all emotion-based decisions
- **Phase 2**: Voice Orchestrator (3 hours) - Highest traffic surface
- **Phase 3**: Task Executor (2 hours) - Execution layer
- **Phase 4**: Planning Engine (2 hours) - Goal formation
- **Phase 5**: Memory Engine (2 hours) - Retrieval + recording
- **Phase 6**: Testing + Validation (4 hours) - Full integration test
- **Phase 7**: Cleanup (1 hour) - Remove direct call patterns

Total: 16 hours of focused refactoring
