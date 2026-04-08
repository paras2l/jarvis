# 4 Critical Improvements: Implementation & Integration

## Overview

Your cognitive workspace now has 4 powerful additions:

```
OLD FLOW:
  Planning → Action

NEW FLOW:
  Planning → Task Queue → Confidence Gate → Tool Registry → Action
                    ↑                         ↑
              (Retry, Schedule,    (Ask user if low confidence,
               Parallel)            select tools dynamically)
                                            ↓
                                      Memory Ranking
                                      (Recall by relevance,
                                       recency, confidence)
```

---

## 1️⃣ Task Queue (Between Planning and Action)

### Problem It Solves
Without a queue, the system tries to execute everything immediately:
- No parallel task execution
- No retry logic
- No scheduling capabilities
- Tasks block each other

### What It Provides

```typescript
import { getTaskQueue } from '@/core/cognitive-workspace'

const taskQueue = getTaskQueue({
  maxConcurrent: 4,        // Run up to 4 tasks in parallel
  enableAutoRetry: true,
  defaultRetryStrategy: 'exponential',
  defaultMaxRetries: 3,
})

// Queue a task
const taskId = await taskQueue.enqueueTask({
  taskId: 'write_report',
  name: 'Write quarterly report',
  state: 'planning',
  priority: 'high',
  dependsOn: ['collect_data'], // Wait for other tasks
  scheduledFor: Date.now() + 5000, // Schedule for 5s from now
  tags: ['reporting', 'quarterly'],
})

// Monitor task
const task = taskQueue.getTask(taskId)
console.log(task.queueStatus) // 'queued' | 'scheduled' | 'executing' | 'retrying' | 'completed' | 'failed'

// Manually manage execution
await taskQueue.startExecution(taskId)
await taskQueue.completeTask(taskId, { success: true })

// Or if it fails
await taskQueue.failTask(taskId, 'Network error')
// Automatically retries with exponential backoff

// Get diagnostics
const diag = taskQueue.getDiagnostics()
console.log(diag.queueHealth) // { avgWaitTime, retryRate, failureRate }
```

### Features

| Feature | Benefit |
|---------|---------|
| **Parallel Execution** | 4 tasks running simultaneously instead of sequential |
| **Auto Retry** | Failed tasks retry with exponential backoff (1s → 2s → 4s) |
| **Task Scheduling** | Schedule tasks for specific times |
| **Dependencies** | Task A waits for Task B to complete before starting |
| **Priority Levels** | urgent, high, medium, low with automatic prioritization |
| **Task Timeouts** | Prevent hanging tasks |

### Architecture Integration

```
Planning Engine → Creates goal
                    ↓
              EnqueueTask (high priority)
                    ↓
              TaskQueue: prioritizes & schedules
                    ↓
              Workspace.activeTask updated
                    ↓
              Listeners notify (WorkspaceReactors)
                    ↓
              Action Layer reacts, calls startExecution
                    ↓
              Task executes
                    ↓
              completeTask | failTask
                    ↓
              Workspace updated, triggers learning
```

---

## 2️⃣ Confidence Gate (Before Execution)

### Problem It Solves
System makes mistakes when confidence is low:
- "Did you mean Visual Studio Code?" (had low confidence)
- Executes destructive operations without confirmation
- User doesn't know when to intervene

### What It Provides

```typescript
import { getConfidenceGate } from '@/core/cognitive-workspace'

const gate = getConfidenceGate({
  threshold: 'medium',                    // Ask user if below medium
  criticalActionsThreshold: 'high',       // Stricter for dangerous ops
  criticalActions: ['delete_files', 'modify_system', 'install_software'],
  autoAllowAbove: 'high',                 // Skip gate if confidence is high
  showAlternatives: true,
})

// Before executing any command
const decision = await gate.evaluateAction(
  'open VSCode',  // What user said
  'open visual studio code',  // What we interpreted
  ['Visual Studio Code', 'VS Code', 'Code Editor'],  // Alternatives
)

console.log(decision.action) // 'allow' | 'ask_user' | 'suggest_alternative' | 'block'

if (decision.action === 'allow') {
  // Execute immediately
  await executeCommand('open VSCode')
} else if (decision.action === 'ask_user') {
  // Show message to user
  console.log(decision.userMessage)
  // ⚠️ I'm not confident about this critical action. Can you clarify: "open VSCode"?
} else if (decision.action === 'suggest_alternative') {
  // Let user pick
  console.log(decision.alternatives)
  // [{ description: 'Visual Studio Code', confidence: 0.5 }, ...]
} else if (decision.action === 'block') {
  // Refuse to execute
  console.log('Critical action requires higher confidence')
}

// Record uncertainty for learning
await gate.recordUncertainty(
  'open VSCode',
  'Multiple interpretations possible',
  'medium'
)
```

### Gate Decision Logic

```typescript
Confidence Levels:
  high (0.85)    → Auto allow, proceed
  medium (0.6)   → Ask user, show alternatives
  low (0.3)      → Ask for confirmation or block
  unknown (0.0)  → Always ask user

For Critical Actions (delete, modify, install):
  high → Allow
  medium → Ask for confirmation
  low → Block, refuse

Non-Critical Actions:
  high → Allow
  medium → Suggest alternatives
  low → Ask for clarification
```

### Safety Features

| Level | Response |
|-------|----------|
| **Very High (0.85+)** | Execute immediately |
| **High (0.7-0.85)** | Execute with confirmation |
| **Medium (0.5-0.7)** | Show alternatives, ask user |
| **Low (<0.5)** | Block and ask for clarification |

---

## 3️⃣ Tool Registry (Dynamic Tool Selection)

### Problem It Solves
Actions are hard-coded to specific tools:
- Only `search_web` tool exists for searching
- Can't add new tools without modifying code
- Agents can't choose optimal tool for task

### What It Provides

```typescript
import { getToolRegistry } from '@/core/cognitive-workspace'

const registry = getToolRegistry()

// Built-in tools available:
// - open_app / close_app
// - write_file / read_file / delete_file
// - search_web
// - run_script
// - control_os

// Get all tools
const allTools = registry.getAllTools()

// Get by category
const fileTools = registry.getToolsByCategory('file_system')

// Get by capability
const writeTools = registry.getToolsByCapability('write')

// Match tools for intent
const matches = registry.matchToolsForIntent(
  'save this text to disk',
  ['write'] // Required capabilities
)
console.log(matches)
// [
//   { tool: write_file, score: 95 },
//   { tool: run_script, score: 20 },
// ]

// Execute best-matched tool
const best = matches[0].tool
const result = await registry.executeTool('write_file', {
  path: './output.txt',
  content: userInput,
})

// Register custom tool
registry.registerTool({
  name: 'send_email',
  category: 'communication',
  description: 'Send an email message',
  capabilities: ['communicate'],
  requiredParams: ['to', 'subject', 'body'],
  optionalParams: ['cc', 'attachments'],
  returns: 'boolean',
  isDestructive: false,
  requiresPermission: true,
  estimatedDuration: 1000,
  successProbability: 0.9,
  validate: (params) => {
    if (!params.to || !params.subject) {
      return { valid: false, error: 'to and subject required' }
    }
    return { valid: true }
  },
  execute: async (params) => {
    // Send email via API
    return { success: true, messageId: '...' }
  },
})

// Get registry diagnostics
const diag = registry.getDiagnostics()
console.log(diag)
// {
//   totalTools: 8,
//   categories: { app_control: 2, file_system: 3, web_search: 1, ... },
//   tools: [...]
// }
```

### Tool Structure

```typescript
Tool = {
  name: string
  category: ToolCategory  // app_control | file_system | web_search | etc
  description: string
  capabilities: ToolCapability[]  // open | write | read | search | execute | etc
  requiredParams: string[]
  optionalParams: string[]
  returns: string  // Type of return value
  
  isDestructive: boolean  // Can cause data loss?
  requiresPermission: boolean  // Needs user approval?
  estimatedDuration: number  // ms, for scheduling
  successProbability: number  // 0-1, baseline success rate
  
  validate(params): { valid: boolean; error?: string }
  execute(params): Promise<any>
}
```

### Benefits

| Benefit | Value |
|---------|-------|
| **Dynamic Selection** | System chooses best tool for intent |
| **Extensibility** | Add tools without modifying core |
| **Scoring** | Tools ranked by capability match + success probability |
| **Safety Checks** | System knows which tools are destructive |
| **Capability Matching** | Find tools that can "write" even if new |

---

## 4️⃣ Memory Ranking (Smart Recall)

### Problem It Solves
Without ranking, memory becomes noisy:
- Equally weighted old and new memories
- No distinction between relevant and irrelevant
- Memory retrieval slow and ineffective

### What It Provides

```typescript
import { getMemoryRankingEngine, contextToMemories } from '@/core/cognitive-workspace'

const ranker = getMemoryRankingEngine({
  relevanceWeight: 0.5,      // How closely matches query
  recencyWeight: 0.3,        // How recent is the memory
  confidenceWeight: 0.2,     // How sure are we
  dayHalfLife: 30,           // Memory fades 50% per 30 days
  minRelevanceThreshold: 0.3,
  minConfidenceThreshold: 0.2,
  maxResults: 10,
})

// Get memories to rank
const workspace = getWorkspaceListener().getState()
const memories = contextToMemories(workspace.memoryContext)

// Rank for a query
const ranked = ranker.rankMemories(
  memories,
  'How did I solve the authentication issue last time?',
  { currentTask: 'auth_implementation' }
)

// Top-ranked memories returned
ranked.forEach((mem, i) => {
  console.log(`${i+1}. ${mem.content}`)
  console.log(`   Score: ${mem.overallScore.toFixed(2)}`)
  console.log(`   Relevance: ${(mem.relevanceScore*100).toFixed(0)}%`)
  console.log(`   Recency: ${(mem.recencyScore*100).toFixed(0)}%`)
  console.log(`   Confidence: ${(mem.confidenceScore*100).toFixed(0)}%`)
})

// Rank by emotional context
const emotionRanked = ranker.rankByEmotionalContext(
  memories,
  'excited', // Current mood
)

// Boost related memories
const primaryMemory = ranked[0]
const boosted = ranker.boostRelatedMemories(
  memories,
  primaryMemory,
  1.2, // 20% boost for shared tags
)

// Get score breakdown
const breakdown = ranker.getScoreBreakdown(ranked[0])
console.log(breakdown)
// {
//   relevance: { score: 0.9, contribution: 0.45 },
//   recency: { score: 0.7, contribution: 0.21 },
//   confidence: { score: 0.85, contribution: 0.17 },
//   overall: 0.83
// }
```

### Ranking Formula

```
Overall Score = (Relevance × 0.5) + (Recency × 0.3) + (Confidence × 0.2)

Where:
  Relevance = keyword matches / query length (0-1)
  Recency = 0.5^(days / 30)  [exponential decay]
  Confidence = 1.0 - (days × 0.01) [linear decay of old memories]
```

### Example Ranking

```
Query: "authentication implementation"

Memory A:
  Content: "Fixed auth with JWT last week"
  Relevance: 0.95 (high, recent)
  Recency: 0.95 (very recent)
  Confidence: 0.95 (high, reliable)
  Overall: 0.95 × 0.5 + 0.95 × 0.3 + 0.95 × 0.2 = 0.95 ✓ TOP

Memory B:
  Content: "Talked to user about project timelines"
  Relevance: 0.2 (low, not about auth)
  Recency: 0.8 (recent)
  Confidence: 0.9
  Overall: 0.2 × 0.5 + 0.8 × 0.3 + 0.9 × 0.2 = 0.46 ✗ FILTERED

Memory C:
  Content: "OAuth implementation guide from 6 months ago"
  Relevance: 0.8 (relevant but old)
  Recency: 0.25 (old, far away)
  Confidence: 0.7 (outdated)
  Overall: 0.8 × 0.5 + 0.25 × 0.3 + 0.7 × 0.2 = 0.52 ← Candidate
```

### Features

| Feature | Benefit |
|---------|---------|
| **Relevance Scoring** | Keyword matching + content similarity |
| **Time Decay** | Old memories weighted less (exponential) |
| **Confidence Weighting** | High-confidence memories bubble up |
| **Emotional Context** | Boost memories from similar moods |
| **Related Memory Boosting** | If primary memory matches, boost similar ones |
| **Filtering** | Minimum thresholds prevent noise |

---

## Integration Example: Complete Flow

### Voice Command: "Write and save my notes"

```
1. USER INPUT
   "Write and save my notes"
       ↓
2. PERCEPTION
   workspace.updateState({ perception: { currentInput: '...' } })
       ↓
3. CONSCIOUSNESS
   Emotion analysis → confidence = 'high'
       ↓
4. PLANNING
   Creates goal: "Save notes to file"
   Enqueues task with taskQueue.enqueueTasks([...])
       ↓
5. TASK QUEUE
   - Prioritizes task (high priority)
   - No dependencies
   - maxConcurrent = 4, currently 2 executing
   - Mark as ready
       ↓
6. ACTION LAYER
   Receives task ready signal
   Gets tools: registry.matchToolsForIntent('save to file')
   Returns: [write_file (score 95), run_script (20)]
       ↓
7. CONFIDENCE GATE
   gate.evaluateAction('save notes', 'write to file')
   Confidence: high → decision = 'allow'
   No user confirmation needed
       ↓
8. TOOL EXECUTION
   execute_tool('write_file', {path: './notes.txt', content: userInput})
   Success!
       ↓
9. MEMORY RANKING
   Task complete, new memory recorded
   Memory engine ranks it by relevance, recency, confidence
   Next time user searches "save notes", this memory ranks high
       ↓
10. TASK QUEUE
    taskQueue.completeTask(taskId, { success: true })
    Triggers learning event
       ↓
11. WORKSPACE
    All modules updated, decision history recorded
    System learned: this task succeeded, confidence was justified
```

---

## Configuration Best Practices

### Task Queue
```typescript
const queue = getTaskQueue({
  maxConcurrent: 4,           // CPUs × 2
  enableAutoRetry: true,
  defaultRetryStrategy: 'exponential',
  defaultMaxRetries: 3,
})
```

### Confidence Gate
```typescript
const gate = getConfidenceGate({
  threshold: 'medium',                    // User approval at medium
  criticalActionsThreshold: 'high',       // Strict for dangerous ops
  autoAllowAbove: 'high',                 // Skip gate if very sure
  showAlternatives: true,
})
```

### Tool Registry
```typescript
const tools = getToolRegistry()
// Register custom tools as needed
tools.registerTool(myCustomTool)
```

### Memory Ranking
```typescript
const ranker = getMemoryRankingEngine({
  relevanceWeight: 0.5,      // Most important: does it match query?
  recencyWeight: 0.3,        // Second: how recent?
  confidenceWeight: 0.2,     // Third: how sure are we?
  dayHalfLife: 30,           // Memories fade over 30 days
  maxResults: 10,            // Top 10 memories
})
```

---

## Success Metrics

After implementing these 4 improvements, measure:

### Task Queue Impact
- ✅ Average task completion time
- ✅ Retry success rate
- ✅ Parallel task efficiency
- ✅ Queue depth stability

### Confidence Gate Impact
- ✅ Mistake rate reduction
- ✅ User confirmation frequency
- ✅ Dangerous operation blocks
- ✅ User trust metrics

### Tool Registry Impact
- ✅ Tool selection accuracy
- ✅ Tool execution success rate
- ✅ Custom tool integration time
- ✅ Extensibility (new tools added per week)

### Memory Ranking Impact
- ✅ Memory retrieval accuracy
- ✅ Top-result relevance score (target: >0.8)
- ✅ Reduced memory noise
- ✅ Learning feedback loop speed

---

## File Locations

All new files are in `src/core/cognitive-workspace/`:
- `task_queue.ts` (354 lines)
- `confidence_gate.ts` (250 lines)
- `tool_registry.ts` (520 lines)
- `memory_ranking.ts` (400 lines)
- `index.ts` (updated with exports)

All files compile cleanly with no errors.
