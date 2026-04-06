export interface RolloutStage {
  stage: number
  trafficPercent: number
  gate: string
}

export const STAGED_ROLLOUT_PLAN: RolloutStage[] = [
  { stage: 1, trafficPercent: 5, gate: 'internal only' },
  { stage: 2, trafficPercent: 15, gate: 'policy deny rate healthy' },
  { stage: 3, trafficPercent: 35, gate: 'mutation stability healthy' },
  { stage: 4, trafficPercent: 60, gate: 'persona feedback trend positive' },
  { stage: 5, trafficPercent: 100, gate: 'all thresholds green' },
]
