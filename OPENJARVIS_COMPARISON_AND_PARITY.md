# OpenJarvis Comparison And Parity Plan

Date: 2026-04-07
Repo compared: https://github.com/open-jarvis/OpenJarvis

## Scope

This document compares OpenJarvis architecture/patterns with Patrich, identifies feature gaps, and tracks what was implemented now.

## OpenJarvis Patterns Observed

1. Strong registry-first architecture for engines, agents, memory, and tools.
2. Multi-turn orchestrator loop with explicit max turns and structured tool calls.
3. Loop guard to prevent repeated tool-call cycles.
4. Security wrapper pattern: guardrails around engine I/O (warn, redact, block).
5. Memory tools as first-class actions (memory manage/search/store).
6. Event bus telemetry and traces across inference, tools, memory, and agent turns.
7. Config-driven presets and agent templates with easy mode switching.
8. Broad channel/connectors and agent manager routes.

## What Patrich Already Has Extra

1. Electron-native desktop runtime with direct local bridge features.
2. Cross-device mesh and remote task routing pipeline.
3. Native app launching and assistive automation hooks.
4. Rich protocol mesh and policy gateway integration.
5. Mood-based personality memory and live canvas updates.
6. Voice-first always-on UX inside desktop app.

## Gap Analysis (Before This Patch)

1. Missing loop-protection in task execution path.
2. No explicit confirmation phase for ambiguous executable commands.
3. No memory-manage command surface from chat (remember/recall/list).
4. Tool-orchestrator style command control was weaker for repeated command storms.

## Implemented In This Patch

1. Task loop guard (OpenJarvis-inspired)
   - Added repeated-command protection in task execution.
   - Blocks repeated identical command fingerprints inside a short window.
   - Returns a user-facing pause message instead of repeatedly executing.

2. Memory-manage command layer (OpenJarvis-inspired)
   - Added parser actions:
     - memory_remember
     - memory_recall
     - memory_list
   - Added execution handlers for those actions in task executor.
   - Wired persistence through existing memory engine.

3. Clarification-confirmation flow (orchestrator interaction inspired)
   - Added pending execution state in chat flow.
   - Ambiguous command now asks follow-up question before execution.
   - Yes/no confirmation triggers execute/cancel path cleanly.

4. Memory retrieval helpers
   - Added memory listing and search helper methods in memory engine:
     - listMemories(limit)
     - searchMemories(query, limit)

## Files Changed

1. src/core/task-executor.ts
   - Added loop guard state and checks.
   - Added memory-manage parse actions.
   - Added memory-manage execute handlers.

2. src/core/memory-engine.ts
   - Added list/search helper methods for memory recall.

3. src/components/ChatInterface.tsx
   - Added ambiguity clarification and confirmation flow.
   - Refactored execution path into reusable executeParsedTask.

## Validation

- TypeScript type-check passed:
  - npm run type-check

## Recommended Next Parity Upgrades

1. Add security output scanner modes for generated replies:
   - warn, redact, block
2. Add structured task plans with max-turns guard metadata.
3. Add tool execution telemetry stream in UI (tool call start/end timeline).
4. Add configurable agent templates in settings (simple/orchestrator/react-like).
5. Add persistent memory summaries and auto-compaction.
6. Add trace viewer for command->policy->executor->result lifecycle.

## Delivery Notes

This patch focused on high-impact runtime behavior that can be safely integrated into Patrich without replacing core architecture. It intentionally adapts OpenJarvis patterns to Patrich-native Electron and policy systems instead of forcing a direct Python code transplant.
