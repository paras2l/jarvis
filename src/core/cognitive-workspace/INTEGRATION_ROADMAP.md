# Integration Roadmap: Wiring 4 Layers into Existing System

## Current Architecture State

```
EXISTING LAYERS (Built):
  ├─ Perception Layer (sensors, audio input, current state)
  ├─ Planning Layer (goal formation, task creation)
  ├─ Memory Layer (past experiences, patterns)
  ├─ Action Layer (command execution)
  └─ Reaction/Learning Layer

NEW LAYERS (Just Added):
  ├─ Task Queue (parallel execution, retry logic)
  ├─ Confidence Gate (safety checks, user approval)
  ├─ Tool Registry (dynamic tool selection)
  └─ Memory Ranking (smart recall)

INTEGRATION NEEDED: Wire new layers into existing system
```

---

## Phase 2A: TaskQueue Integration

### What Needs to Change

**File: `src/core/brain_loop/planning_engine.ts`** (or similar)

Currently:
```typescript
// OLD: Direct action execution
await taskExecutor.execute(command)
```

Should be:
```typescript
// NEW: Queue task, let system execute when ready
const taskQueue = getTaskQueue()
await taskQueue.enqueueTask({
  taskId: generateId(),
  name: command.description,
  state: 'planning',
  priority: command.urgency === 'urgent' ? 'urgent' : 'high',
  tags: command.tags,
})
```

### Benefits
- Planning engine no longer blocks on execution
- Multiple goals can queue tasks simultaneously
- System auto-retries failed tasks
- Enables parallel execution

### Integration Steps

1. **Import TaskQueue**
   ```typescript
   import { getTaskQueue } from '@/core/cognitive-workspace'
   ```

2. **Replace executeTask() calls**
   ```typescript
   // Find all direct execution calls
   // Replace with taskQueue.enqueueTask()
   ```

3. **Listen for task completion**
   ```typescript
   const listener = getWorkspaceListener()
   listener.onTaskChange((change) => {
     if (change.newValue.queueStatus === 'completed') {
       // Task finished, update goal status
     }
   })
   ```

4. **Test**
   ```
   - Enqueue 3 tasks with different priorities
   - All should execute (not block on first)
   - Lower priority tasks should wait
   ```

### Migration Path
- **Day 1**: Add TaskQueue imports, non-breaking
- **Day 2**: Route new tasks through queue
- **Day 3**: Redirect existing execution paths
- **Day 4**: Deprecate direct execution
- **Day 5**: Remove old path

---

## Phase 2B: ConfidenceGate Integration

### What Needs to Change

**File: `src/core/consciousness/voice_orchestrator.ts`** (or similar)

Currently:
```typescript
// OLD: Execute immediately
await voiceOrchestrator.processCommand(userInput)
```

Should be:
```typescript
// NEW: Check confidence first
const gate = getConfidenceGate()
const decision = await gate.evaluateAction(
  userInput,
  interpretedCommand,
  alternatives
)

if (decision.action === 'allow') {
  await voiceOrchestrator.processCommand(interpretedCommand)
} else if (decision.action === 'ask_user') {
  // Prompt user via UI
  return decision.userMessage
} else {
  // block or suggest_alternative
  return decision.alternatives
}
```

### Benefits
- Prevents mistakes on destructive operations
- User can confirm low-confidence decisions
- System learns what it got wrong

### Integration Steps

1. **Import ConfidenceGate**
   ```typescript
   import { getConfidenceGate } from '@/core/cognitive-workspace'
   ```

2. **Add gate evaluation**
   ```typescript
   // Before executing any command
   const gate = getConfidenceGate()
   const decision = await gate.evaluateAction(...)
   ```

3. **Handle gate responses**
   ```typescript
   switch (decision.action) {
     case 'allow': // Execute
     case 'ask_user': // Return prompt
     case 'suggest_alternative': // Show options
     case 'block': // Refuse
   }
   ```

4. **Integrate with UI**
   ```typescript
   // Return userMessage to UI component
   // UI shows confirmation dialog
   // User responds → continues processing
   ```

### Critical Actions Protected
- `delete_files`
- `modify_system`
- `install_software`
- `run_script`
- `factory_reset`

### Migration Path
- **Week 1**: Add gate evaluation to voice orchestrator
- **Week 2**: Test confidence scoring
- **Week 3**: Integrate with UI confirmation flows
- **Week 4**: Fine-tune thresholds based on actual use

---

## Phase 2C: ToolRegistry Integration

### What Needs to Change

**File: `src/core/action/task_executor.ts`** (or similar)

Currently:
```typescript
// OLD: Hard-coded tool mapping
if (command.type === 'save') {
  return await fileSystem.write(...)
} else if (command.type === 'search') {
  return await web.search(...)
}
```

Should be:
```typescript
// NEW: Dynamic tool selection
const registry = getToolRegistry()
const tools = registry.matchToolsForIntent(
  command.description,
  command.requiredCapabilities || []
)

const bestTool = tools[0].tool  // Highest score
const result = await registry.executeTool(bestTool.name, command.params)
```

### Benefits
- Add new tools without modifying executor
- System picks best tool for each command
- Easier to test different implementations

### Integration Steps

1. **Import ToolRegistry**
   ```typescript
   import { getToolRegistry } from '@/core/cognitive-workspace'
   ```

2. **Get tools for command**
   ```typescript
   const registry = getToolRegistry()
   const matches = registry.matchToolsForIntent(
     userIntent,
     requiredCapabilities
   )
   ```

3. **Execute best match**
   ```typescript
   const bestMatch = matches[0]
   if (bestMatch.score > 70) {  // Confidence threshold
     return await registry.executeTool(
       bestMatch.tool.name,
       params
     )
   } else {
     // Score too low, ask user
     return matches  // Show options
   }
   ```

4. **Register custom tools**
   ```typescript
   // If system uses special tools (e.g., calendar, email)
   registry.registerTool({
     name: 'add_calendar_event',
     category: 'communication',
     ...
   })
   ```

### Tools Available
- `open_app` (0.9 success)
- `close_app` (0.85 success)
- `write_file` (0.95 success)
- `read_file` (0.98 success)
- `delete_file` (0.95 success)
- `search_web` (0.9 success)
- `run_script` (0.8 success)
- `control_os` (0.85 success)

### Migration Path
- **Phase 1**: Parallel implementation (old + new side-by-side)
- **Phase 2**: Route 50% of commands through registry
- **Phase 3**: Route 75% through registry
- **Phase 4**: Complete migration, remove old paths

---

## Phase 2D: MemoryRanking Integration

### What Needs to Change

**File: `src/core/memory/memory_engine.ts`** (or similar)

Currently:
```typescript
// OLD: Retrieve memories without ranking
const memories = this.memories.filter(m => m.tags.includes(query))
return memories  // Unranked, equal weight
```

Should be:
```typescript
// NEW: Smart ranking by relevance, recency, confidence
const ranker = getMemoryRankingEngine()
const ranked = ranker.rankMemories(
  this.memories,
  query,
  { currentTask: this.currentTask }
)
return ranked.slice(0, 10)  // Top 10 ranked
```

### Benefits
- Highly relevant memories surface first
- Old memories deprioritized automatically
- Emotional context boosts related memories
- Prevents memory noise

### Integration Steps

1. **Import MemoryRanking**
   ```typescript
   import { 
     getMemoryRankingEngine,
     contextToMemories 
   } from '@/core/cognitive-workspace'
   ```

2. **Replace memory retrieval**
   ```typescript
   // Convert memory context to rankable format
   const memories = contextToMemories(workspace.memoryContext)
   
   // Rank by query
   const ranker = getMemoryRankingEngine()
   const ranked = ranker.rankMemories(memories, userQuery)
   ```

3. **Use emotional context**
   ```typescript
   const currentEmotion = workspace.emotionalState.dominantEmotion
   const emotionRanked = ranker.rankByEmotionalContext(
     memories,
     currentEmotion
   )
   ```

4. **Boost related memories**
   ```typescript
   const primary = ranked[0]
   const boosted = ranker.boostRelatedMemories(
     memories,
     primary,
     1.2  // 20% boost
   )
   ```

### Ranking Factors
- **Relevance (50%)**: Keyword match quality
- **Recency (30%)**: How recent (30-day half-life)
- **Confidence (20%)**: How sure are we

### Migration Path
- **Week 1**: Parallel ranking (compare results)
- **Week 2**: Switch to ranked retrieval
- **Week 3**: Tune weights (relevance vs recency)
- **Week 4**: Add emotion context boosting

---

## End-to-End Flow After Integration

### Scenario: "Save my meeting notes and remind me tomorrow"

```
1. USER INPUT
   "Save my meeting notes and remind me tomorrow"
   
2. VOICE ORCHESTRATOR
   • Input: "save ... remind ..."
   • Interpreted: [save_notes, set_reminder]
   • Confidence: high
   
3. CONFIDENCE GATE
   • Action type: file_write (0.95 confidence) + reminder (0.85)
   • decision.action = 'allow'
   • Proceed to execution
   
4. PLANNING LAYER
   • Create 2 goals:
     - Goal A: "Save notes to file"
     - Goal B: "Remind me at 9am tomorrow"
   
5. TASK QUEUE
   • Enqueue task A: priority=high, name="save_notes"
   • Enqueue task B: priority=high, name="set_reminder"
   • Queue has capacity, both execute in parallel
   
6. TOOL REGISTRY
   • Task A: matchToolsForIntent("save notes")
     → Best: write_file (score 95)
   • Task B: matchToolsForIntent("schedule reminder")
     → Best: control_os (score 75) or custom reminder_tool (score 90)
   
7. ACTION LAYER
   • Execute write_file → SUCCESS
   • Execute reminder_tool → SUCCESS
   
8. MEMORY RANKING
   • New memory created: "Saved notes on 2024-01-15"
   • Ranked high: relevance=0.95, recency=1.0, confidence=0.95
   • Next query "save notes" will find this quickly
   
9. LEARNING LAYER
   • Both tasks succeeded
   • Confidence scores validated
   • Tool selections learned
   • System gains pattern: "meeting notes + reminder" = common pattern
   
10. RESPONSE TO USER
    "✓ Saved notes to /documents/meeting_notes_2024-01-15.txt"
    "✓ Reminder set for tomorrow at 9am"
```

---

## Integration Testing Strategy

### Unit Level
```typescript
// Test 1: TaskQueue
✓ Enqueue task, verify it queues
✓ Task executes, verify status changes
✓ Failed task retries, verify backoff

// Test 2: ConfidenceGate
✓ Low confidence action triggers ask_user
✓ High confidence action allows
✓ Critical action blocks if confidence low

// Test 3: ToolRegistry
✓ Intent matching returns correct tools
✓ Best tool scores highest
✓ Custom tool registration works

// Test 4: MemoryRanking
✓ Recent memory ranks higher than old
✓ Relevant memory ranks higher than irrelevant
✓ Top result always best match
```

### Integration Level
```typescript
// Test 5: Task Queue → Tool Registry
✓ Task queues, system selects right tool
✓ Tool executes, task completes

// Test 6: Voice → Gate → Queue
✓ Command → confidence check → queued
✓ Low confidence prompts before queuing

// Test 7: Memory Ranking ← Actions
✓ After successful action, memory created
✓ Memory ranks high on related query

// Test 8: Full Loop
✓ User command → gate → queue → tools → memory
✓ All status updates flow through workspace
✓ Learning feedback loop works
```

### E2E Scenarios
```
Scenario 1: "Find files modified today"
  • Query → ranking retrieves similar past tasks
  • Plans search task
  • Queue executes with tool registry
  • New memory created (ranks high next time)

Scenario 2: "Delete my old backup" (critical action)
  • Gate blocks (confidence 0.6, needs 0.85 for delete)
  • Asks user confirmation
  • User confirms
  • Task queued
  • Executed via delete_file tool
  • Logged with high confidence

Scenario 3: "Check my email and export to CSV"
  • Two goals: read_email, export_csv
  • Both queued simultaneously
  • Registry selects: read_file for email, write_file for CSV
  • Parallel execution
  • Memories created for both
```

---

## Rollout Timeline

### Week 1: Job Scheduling (Task Queue)
- Goal: Enable parallel execution
- Minimal user impact (transparent queuing)
- Success metric: 3+ tasks execute in parallel

### Week 2: Safety Checks (Confidence Gate)
- Goal: Prevent mistakes on critical operations
- User-visible (confirmation prompts)
- Success metric: 0% accidental deletions

### Week 3: Tool Flexibility (Tool Registry)
- Goal: Enable easy tool addition
- Developer-visible (new tools can be added)
- Success metric: 1st custom tool registered

### Week 4: Smart Recall (Memory Ranking)
- Goal: Improve memory retrieval quality
- System-visible (faster, more relevant recalls)
- Success metric: Top result relevance > 0.85

### Weeks 5+: Fine-Tuning & Expansion
- Adjust weights and thresholds
- Add more custom tools
- Expand confidence scoring
- Performance optimization

---

## Files to Modify

```
Phase 2A (Task Queue):
  - planning_engine.ts: Route tasks through queue
  - task_executor.ts: Respect task scheduling

Phase 2B (Confidence Gate):
  - voice_orchestrator.ts: Gate before execution
  - action_router.ts: Check confidence on all actions

Phase 2C (Tool Registry):
  - task_executor.ts: Dynamic tool selection
  - action_handler.ts: Execute tools from registry

Phase 2D (Memory Ranking):
  - memory_engine.ts: Rank during retrieval
  - consciousness.ts: Use ranked memories for context
```

---

## Success Criteria

| Layer | Criterion | Deadline |
|-------|-----------|----------|
| **Task Queue** | 3+ parallel tasks | Week 1 |
| **Confidence Gate** | 100% critical action confirmation | Week 2 |
| **Tool Registry** | 1st registered tool added | Week 3 |
| **Memory Ranking** | Top result > 0.85 relevance | Week 4 |
| **Full Integration** | All 4 layers working together | Week 5 |

---

## Monitoring & Metrics

After each phase, measure:

1. **Task Queue**
   - Average task completion time
   - Parallel efficiency ratio
   - Retry success rate

2. **Confidence Gate**
   - Mistake rate (before/after)
   - User decision frequency
   - Critical action blocks per week

3. **Tool Registry**
   - Tool selection accuracy %
   - Tool execution success %
   - Time to add new tool

4. **Memory Ranking**
   - Top result relevance score
   - Memory noise reduction
   - Query satisfaction %

---

## Next Steps

1. **Pick one phase to start** (recommend Task Queue first)
2. **Create integration branch**: `feature/integrate-task-queue`
3. **Find existing relevant file** (e.g., planning_engine.ts)
4. **Add imports** for TaskQueue
5. **Replace 1 direct call** with queue.enqueueTask()
6. **Test** with simple scenario
7. **Iterate** and expand to other callers
8. **Merge** when working
9. **Move to next phase**

---

## Questions to Answer

- [ ] Which planning engine file routes tasks to executor?
- [ ] Which voice orchestrator file handles command interpretation?
- [ ] Which task executor file has hard-coded tool mapping?
- [ ] Which memory engine file retrieves memories?
- [ ] Are there test files for each layer?
- [ ] What's the deployment process?
- [ ] Who can review integration PRs?
