import type { SelfUnifiedState } from './self_state_schema'
import { calculateSelfAwarenessReport } from './self_awareness_report'
import { calculateNeedsScoreboard } from './self_needs_scoreboard'
import { detectSelfContradictions } from './self_contradiction_detector'
import { selfNarrationStream } from './self_narration_stream'
import { composeSelfUnifiedState } from './self_unified_state'

export type SelfReflectionLoopStateInput = any

export interface SelfReflectionLoopResult {
  narrationUpdated: boolean
  contradictionsUpdated: boolean
  needsUpdated: boolean
  unifiedState: SelfUnifiedState
  awarenessReport: ReturnType<typeof calculateSelfAwarenessReport>
}

export function runSelfReflectionLoop(state: SelfReflectionLoopStateInput, reason: string, source: 'input' | 'outcome' | 'system' | 'goal' | 'transition' | 'bootstrap' = 'transition'): SelfReflectionLoopResult {
  const awarenessReport = calculateSelfAwarenessReport(state)
  const contradictions = detectSelfContradictions({
    beliefSnapshot: state.beliefSnapshot,
    goalCompass: state.goalCompass,
    executionAdvisor: state.executionAdvisor,
    reflection: state.reflection,
    narrationThread: state.narrationStream.narrative,
  })
  const needs = calculateNeedsScoreboard(state)
  const narration = selfNarrationStream.composeFromState(state, reason, source)
  const unifiedState = composeSelfUnifiedState({
    state: {
      ...state,
      contradictionDetector: contradictions,
      needsScoreboard: needs,
      narrationStream: narration,
      unifiedState: state.unifiedState,
    },
    awareness: awarenessReport,
    needs,
    contradictions,
    narration,
  })

  return {
    narrationUpdated: true,
    contradictionsUpdated: contradictions.openCount > 0,
    needsUpdated: true,
    unifiedState: unifiedState as unknown as SelfUnifiedState,
    awarenessReport,
  }
}
