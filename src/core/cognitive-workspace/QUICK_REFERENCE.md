# Quick Reference: 4 Powerful Layers

Copy-paste ready code snippets for using Task Queue, Confidence Gate, Tool Registry, and Memory Ranking.

---

## 🚀 Task Queue: Parallel Execution

### Basic Usage
```typescript
import { getTaskQueue } from '@/core/cognitive-workspace'

const queue = getTaskQueue()

// Queue a task
const taskId = await queue.enqueueTask({
  taskId: 'my-task',
  name: 'Do something',
  priority: 'high',  // urgent | high | medium | low
  state: 'planning',
  tags: ['work', 'important'],
})

// Check status
const task = queue.getTask(taskId)
console.log(task.queueStatus)  // queued | executing | completed | failed

// Wait for completion
queue.onTaskComplete(taskId, (result) => {
  console.log('Task done!', result)
})

// Handle failure
queue.onTaskFailed(taskId, (error) => {
  console.log('Task failed:', error)
})
```

### With Retries
```typescript
const taskId = await queue.enqueueTask({
  taskId: 'network-task',
  name: 'Call API',
  priority: 'high',
  maxRetries: 3,
  retryStrategy: 'exponential',  // none | linear | exponential
  retryDelay: 1000,  // ms
  state: 'planning',
})
// Auto-retries: 1s, 2s, 4s delays
```

### With Dependencies
```typescript
// Task B waits for Task A
const taskA = await queue.enqueueTask({
  taskId: 'download-data',
  name: 'Download files',
  priority: 'high',
  state: 'planning',
})

const taskB = await queue.enqueueTask({
  taskId: 'process-data',
  name: 'Process files',
  priority: 'high',
  dependsOn: ['download-data'],  // Waits for task A
  state: 'planning',
})
```

### Parallel Tasks
```typescript
const ids = await Promise.all([
  queue.enqueueTask({ taskId: 'task1', name: 'Download', priority: 'high' }),
  queue.enqueueTask({ taskId: 'task2', name: 'Process', priority: 'high' }),
  queue.enqueueTask({ taskId: 'task3', name: 'Export', priority: 'high' }),
])
// All 3 execute in parallel (up to maxConcurrent)
```

---

## 🛑 Confidence Gate: Safety Checks

### Basic Usage
```typescript
import { getConfidenceGate } from '@/core/cognitive-workspace'

const gate = getConfidenceGate()

const decision = await gate.evaluateAction(
  'delete myfile.txt',              // Original input
  'delete_file("myfile.txt")',      // Interpreted command
  ['Delete it', 'Cancel', 'Backup first'],  // User options
)

if (decision.action === 'allow') {
  // Execute immediately
  await executeCommand()
} else if (decision.action === 'ask_user') {
  // Show confirmation
  console.log(decision.userMessage)
  // ⚠️ I'm not confident about this operation. Can you confirm?
} else if (decision.action === 'suggest_alternative') {
  // Show options
  console.log(decision.alternatives)
} else if (decision.action === 'block') {
  // Refuse
  console.log('Too dangerous!')
}
```

### Confidence Levels
```typescript
// High (≥0.85): Auto-allow
const decision1 = await gate.evaluateAction(
  'open visual studio',  // High confidence
  'launch_app("VSCode")',
  []
)
// decision1.action = 'allow'

// Medium (0.6-0.8): Ask user
const decision2 = await gate.evaluateAction(
  'open vs',  // Ambiguous
  'launch_app("Visual Studio")',
  ['Visual Studio', 'VSCode', 'Another editor'],
)
// decision2.action = 'ask_user'

// Low (<0.5): Block
const decision3 = await gate.evaluateAction(
  'xyz 123',  // No idea what this is
  'unknown_command("xyz")',
  []
)
// decision3.action = 'block'
```

### Critical Actions (Always Strict)
```typescript
// These require HIGH confidence (0.85+)
const criticalActions = [
  'delete_files',
  'modify_system',
  'install_software',
  'run_script',
  'factory_reset',
]

// Even if confidence is 0.75, it will ask for confirmation
const decision = await gate.evaluateAction(
  'uninstall adobe',
  'run_uninstaller("adobe")',
  []
)
// decision.action will be 'ask_user' (0.75 < 0.85)
```

### Get Statistics
```typescript
const stats = gate.getStatistics()
console.log(stats)
// {
//   totalEvaluations: 42,
//   blockedActions: 3,
//   userConfirmations: 8,
//   avgConfidence: 0.78,
// }
```

---

## 🔧 Tool Registry: Dynamic Tools

### Built-in Tools
```typescript
import { getToolRegistry } from '@/core/cognitive-workspace'

const registry = getToolRegistry()

// 8 pre-built tools:
// - open_app (success: 0.9)
// - close_app (success: 0.85)
// - write_file (success: 0.95)
// - read_file (success: 0.98)
// - delete_file (success: 0.95)
// - search_web (success: 0.9)
// - run_script (success: 0.8)
// - control_os (success: 0.85)
```

### Find Best Tool
```typescript
// Match tools to intent
const matches = registry.matchToolsForIntent(
  'save this to disk',        // Intent
  ['write']                   // Required capabilities (optional)
)

console.log(matches)
// [
//   { tool: write_file, score: 95 },
//   { tool: run_script, score: 20 },
// ]

// Use best match
const best = matches[0].tool
await registry.executeTool(best.name, {
  path: './output.txt',
  content: data,
})
```

### Filter by Category
```typescript
// Get specific types of tools
const fileTools = registry.getToolsByCategory('file_system')
const webTools = registry.getToolsByCategory('web_search')
const appTools = registry.getToolsByCategory('app_control')

console.log(fileTools)
// [write_file, read_file, delete_file]
```

### Filter by Capability
```typescript
// Get all tools that can "write"
const writeTools = registry.getToolsByCapability('write')
// [write_file]

// Get all tools that can "read"
const readTools = registry.getToolsByCapability('read')
// [read_file]

// Get all tools that can "execute"
const execTools = registry.getToolsByCapability('execute')
// [run_script, control_os]
```

### Register Custom Tool
```typescript
registry.registerTool({
  name: 'send_email',
  category: 'communication',
  description: 'Send email message',
  capabilities: ['communicate'],
  
  requiredParams: ['to', 'subject', 'body'],
  optionalParams: ['cc', 'bcc', 'attachments'],
  returns: 'EmailResult',
  
  isDestructive: false,
  requiresPermission: true,
  estimatedDuration: 1000,
  successProbability: 0.9,
  
  failureReasons: ['InvalidEmail', 'SMTPError', 'Timeout'],
  
  validate: (params) => {
    if (!params.to?.includes('@')) {
      return { valid: false, error: 'Invalid email' }
    }
    return { valid: true }
  },
  
  execute: async (params) => {
    const result = await emailService.send(params)
    return { success: true, messageId: result.id }
  },
})

// Now use it
const result = await registry.executeTool('send_email', {
  to: 'user@example.com',
  subject: 'Hello',
  body: 'Test message',
})
```

### Get Tool Info
```typescript
const tool = registry.getTool('write_file')
console.log(tool)
// {
//   name: 'write_file',
//   category: 'file_system',
//   description: 'Write content to file',
//   capabilities: ['write'],
//   successProbability: 0.95,
//   isDestructive: false,
//   ...
// }
```

---

## 🧠 Memory Ranking: Smart Recall

### Basic Usage
```typescript
import { 
  getMemoryRankingEngine,
  contextToMemories,
} from '@/core/cognitive-workspace'

const ranker = getMemoryRankingEngine()
const workspace = getWorkspaceListener().getState()

// Get all memories
const memories = contextToMemories(workspace.memoryContext)

// Rank by query
const ranked = ranker.rankMemories(
  memories,
  'How do I save files?',  // Search query
  { currentTask: 'file_handling' }  // Context
)

console.log(ranked[0])
// {
//   content: 'Saved files using write_file tool',
//   overallScore: 0.92,
//   relevanceScore: 0.95,
//   recencyScore: 0.90,
//   confidenceScore: 0.85,
// }

// Use top memories
ranked.slice(0, 3).forEach(mem => {
  console.log(`${mem.content} (score: ${mem.overallScore.toFixed(2)})`)
})
```

### Rank by Emotion
```typescript
// Boost memories matching current mood
const emotionRanked = ranker.rankByEmotionalContext(
  memories,
  'excited'  // Current emotion
)

// Memories with 'excited' tag get 1.2x boost
console.log(emotionRanked[0])
// Memories tagged 'excited' float to top
```

### Boost Related Memories
```typescript
// If one memory is relevant, boost others with same tags
const primary = ranked[0]

const boosted = ranker.boostRelatedMemories(
  memories,
  primary,
  1.2  // 20% boost multiplier
)

// Memories with shared tags now score higher
```

### Get Score Breakdown
```typescript
const breakdown = ranker.getScoreBreakdown(ranked[0])
console.log(breakdown)
// {
//   relevance: { score: 0.95, contribution: 0.475 },
//   recency: { score: 0.90, contribution: 0.270 },
//   confidence: { score: 0.85, contribution: 0.170 },
//   overall: 0.915,
// }
```

### Configure Ranking
```typescript
const customRanker = getMemoryRankingEngine({
  relevanceWeight: 0.6,      // Emphasize keyword match
  recencyWeight: 0.2,        // Less emphasis on date
  confidenceWeight: 0.2,     // Less emphasis on certainty
  dayHalfLife: 60,           // Memories fade over 60 days
  minRelevanceThreshold: 0.5,
  minConfidenceThreshold: 0.3,
  maxResults: 15,            // Return top 15
  minResults: 3,             // At least 3 results
})
```

### Recency Formula
```typescript
// Memories decay exponentially over time
// Default: 30-day half-life (memory is 50% fresh after 30 days)

// After 30 days:  score = 0.5
// After 60 days:  score = 0.25
// After 90 days:  score = 0.125
// After 1 year:   score = 0.002 (auto-excluded)

// Customize:
const ranker = getMemoryRankingEngine({
  dayHalfLife: 14,  // Faster decay (14-day half-life)
})
```

---

## 🔗 Integration Examples

### Example 1: Queue Task → Execute with Gate
```typescript
import { getTaskQueue, getConfidenceGate, getToolRegistry } from '@/core/cognitive-workspace'

async function handleUserCommand(userInput) {
  // 1. Parse and interpret
  const interpreted = interpretCommand(userInput)
  
  // 2. Check confidence
  const gate = getConfidenceGate()
  const decision = await gate.evaluateAction(
    userInput,
    interpreted.command,
    interpreted.alternatives
  )
  
  if (decision.action !== 'allow') {
    return { status: 'pending', message: decision.userMessage }
  }
  
  // 3. Queue task
  const queue = getTaskQueue()
  const taskId = await queue.enqueueTask({
    taskId: `cmd-${Date.now()}`,
    name: interpreted.description,
    priority: interpreted.urgent ? 'urgent' : 'high',
  })
  
  // 4. Select and execute tool
  const registry = getToolRegistry()
  const tools = registry.matchToolsForIntent(
    interpreted.description
  )
  
  if (tools.length > 0) {
    const bestTool = tools[0].tool
    const result = await registry.executeTool(
      bestTool.name,
      interpreted.params
    )
    
    // 5. Mark task complete
    await queue.completeTask(taskId, { success: true, result })
    return { status: 'success', result }
  }
  
  return { status: 'failed', error: 'No tool found' }
}
```

### Example 2: Recall Memory → Use in Decision
```typescript
import { 
  getMemoryRankingEngine,
  contextToMemories,
  getWorkspaceListener,
} from '@/core/cognitive-workspace'

async function makeDecision(currentProblem) {
  // 1. Gather context
  const workspace = getWorkspaceListener().getState()
  const memories = contextToMemories(workspace.memoryContext)
  
  // 2. Rank memories by relevance
  const ranker = getMemoryRankingEngine()
  const relevant = ranker.rankMemories(
    memories,
    currentProblem,
    { currentTask: workspace.activeTask }
  )
  
  // 3. Get top 3 relevant memories
  const pastExperiences = relevant.slice(0, 3)
  
  // 4. Use for decision
  const decision = await consultExpertSystem({
    currentProblem,
    pastExamples: pastExperiences,
    confidence: relevant[0]?.overallScore || 0,
  })
  
  return decision
}
```

### Example 3: Full Pipeline
```typescript
async function intelligentCommand(userInput) {
  const { getTaskQueue, getConfidenceGate, getToolRegistry, getMemoryRankingEngine } = 
    require('@/core/cognitive-workspace')
  
  // Step 1: Check confidence
  const gate = getConfidenceGate()
  const confidence = await gate.evaluateAction(
    userInput,
    interpretCommand(userInput),
    []
  )
  if (confidence.action !== 'allow') {
    return { needsConfirmation: true, message: confidence.userMessage }
  }
  
  // Step 2: Recall similar past actions
  const ranker = getMemoryRankingEngine()
  const pastActions = ranker.rankMemories(memories, userInput)
  
  // Step 3: Queue task
  const queue = getTaskQueue()
  const taskId = await queue.enqueueTask({
    taskId: `task-${Date.now()}`,
    name: userInput,
    priority: 'high',
  })
  
  // Step 4: Find best tool
  const registry = getToolRegistry()
  const tools = registry.matchToolsForIntent(userInput)
  
  // Step 5: Execute
  const bestTool = tools[0].tool
  const result = await registry.executeTool(bestTool.name, {...})
  
  // Step 6: Record success
  await queue.completeTask(taskId)
  
  return { status: 'success', result, confidence, pastActions }
}
```

---

## 📊 Configuration Presets

### Production
```typescript
const queue = getTaskQueue({
  maxConcurrent: 4,
  enableAutoRetry: true,
  defaultRetryStrategy: 'exponential',
})

const gate = getConfidenceGate({
  threshold: 'medium',
  criticalActionsThreshold: 'high',
  autoAllowAbove: 'high',
})

const ranker = getMemoryRankingEngine({
  relevanceWeight: 0.5,
  recencyWeight: 0.3,
  confidenceWeight: 0.2,
  dayHalfLife: 30,
})
```

### Development
```typescript
const queue = getTaskQueue({
  maxConcurrent: 2,
  enableAutoRetry: true,
  defaultRetryStrategy: 'none',  // No retries in dev
})

const gate = getConfidenceGate({
  threshold: 'low',  // Permissive
  autoAllowAbove: 'low',
})

const ranker = getMemoryRankingEngine({
  dayHalfLife: 7,  // Fast decay for testing
  maxResults: 5,
})
```

### Testing
```typescript
const queue = getTaskQueue({
  maxConcurrent: 1,  // Sequential
  enableAutoRetry: false,
})

const gate = getConfidenceGate({
  threshold: 'high',  // Strict
})

const ranker = getMemoryRankingEngine({
  dayHalfLife: 1,  // Everything old
  minResults: 1,
})
```

---

## ✅ Troubleshooting

### Task stuck in queue
```typescript
const queue = getTaskQueue()
const diag = queue.getDiagnostics()
console.log(diag.queueHealth)

// If avgWaitTime > 10s, check:
// 1. Is maxConcurrent too low?
// 2. Are dependencies blocking?
// 3. Is task executor actually executing?
```

### Gate always blocking
```typescript
const gate = getConfidenceGate()
const stats = gate.getStatistics()
console.log(stats.blockRate)

// If blockRate > 30%, check:
// 1. Is confidence scoring too strict?
// 2. Are thresholds calibrated?
// 3. Should some actions be non-critical?
```

### Memory ranking irrelevant
```typescript
const ranker = getMemoryRankingEngine()
const results = ranker.rankMemories(memories, query)

// If top result score < 0.6:
// 1. Are memories tagged correctly?
// 2. Is query too vague?
// 3. Check getScoreBreakdown()
```

---

## 🚀 Next Steps

1. **Copy a snippet** that matches your use case
2. **Update with your imports** from your file structure
3. **Test with simple data**
4. **Integrate into your flow**
5. **Monitor metrics** (check diagnostics)
6. **Tune thresholds** based on behavior

---
