import { intelligenceRouter } from '@/core/intelligence-router'
import { memoryEngine } from '@/core/memory-engine'
import { contextManager } from '@/layers/identity_continuity/context_manager'
import { selfModelLayer } from '@/layers/self_model/self_model_layer'
import { soulEngine } from '@/core/soul-engine'
import { emotionCore, type EmotionReactionPolicy, type EmotionSnapshot } from '@/core/emotion/emotion-core'
import { getCommonBrainRules, pickBrainPromptPack } from './brain-prompt-packs'

export type BrainSituation =
  | 'greeting'
  | 'confirmation'
  | 'repair'
  | 'question'
  | 'research'
  | 'creative'
  | 'task'
  | 'memory'
  | 'status'
  | 'conversation'
  | 'idle'

export interface BrainContext {
  text: string
  intent?: string
  mode?: 'digest' | 'triage'
  silentMode?: boolean
  mood?: string
  emotionSnapshot?: EmotionSnapshot
  userName?: string
  confidence?: number
  recentTurns?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>
}

export interface BrainDirective {
  situation: BrainSituation
  responseStyle: string
  mood: string
  emotion: EmotionSnapshot
  reactionPolicy: EmotionReactionPolicy
  creativity: number
  novelty: number
  shouldUseReasoning: boolean
  promptGuidance: string
  speechPlan: {
    intent: 'confirmation' | 'action' | 'research' | 'memory' | 'system' | 'conversation' | 'error'
    tempo: 'fast' | 'normal' | 'slow'
    brevity: 'short' | 'normal' | 'detailed' | 'auto'
    priority: 'low' | 'normal' | 'high'
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function similarity(a: string, b: string): number {
  const left = new Set(a.toLowerCase().split(/\W+/).filter(Boolean))
  const right = new Set(b.toLowerCase().split(/\W+/).filter(Boolean))
  if (!left.size || !right.size) return 0

  let overlap = 0
  left.forEach((token) => {
    if (right.has(token)) overlap += 1
  })

  return overlap / Math.max(left.size, right.size)
}

class BrainDirector {
  analyze(context: BrainContext): BrainDirective {
    const text = String(context.text || '').trim()
    const normalized = text.toLowerCase()
    const recentTurns = context.recentTurns || memoryEngine.getConversationContext(8)
    const baseEmotion = context.emotionSnapshot || emotionCore.analyzeText(text)
    const resolved = emotionCore.resolveWithDecay(baseEmotion, recentTurns)
    const emotion = resolved.snapshot
    const mood = (context.mood || emotionCore.toMoodLabel(emotion.emotion) || memoryEngine.getCurrentMood().mood || 'neutral').toLowerCase()
    const situation = this.detectSituation(normalized, context.intent)
    const novelty = this.computeNovelty(normalized, recentTurns)
    const creativity = this.computeCreativity(normalized, mood, novelty)
    const responseStyle = this.pickResponseStyle(situation, mood, creativity, novelty, resolved.policy)

    return {
      situation,
      responseStyle,
      mood,
      emotion,
      reactionPolicy: resolved.policy,
      creativity,
      novelty,
      shouldUseReasoning: situation === 'research' || situation === 'creative' || situation === 'task' || creativity > 0.65,
      promptGuidance: this.buildPromptGuidance(situation, mood, creativity, novelty, context, resolved.policy),
      speechPlan: this.buildSpeechPlan(situation, mood, creativity, resolved.policy),
    }
  }

  buildPromptEnvelope(context: BrainContext): string {
    const directive = this.analyze(context)
    const pack = pickBrainPromptPack(this.resolvePromptPackKey(context, directive.situation))
    const recent = this.formatRecentTurns(context.recentTurns || memoryEngine.getConversationContext(8))
    const memoryHints = this.formatMemoryHits(context.text, 4)
    const soulPrefix = soulEngine.getSystemPrompt()
    const commonRules = getCommonBrainRules().map((line) => `- ${line}`).join('\n')
    const scratchpad = this.buildOpenPixiScratchpad(context, directive, recent, memoryHints)

    return [
      soulPrefix.trim(),
      '',
      '# Brain Core',
      `Situation: ${directive.situation}`,
      `Mood: ${directive.mood}`,
      `Emotion: ${directive.emotion.emotion} (${directive.emotion.confidence.toFixed(2)})`,
      `Emotion profile: intensity=${directive.emotion.intensity.toFixed(2)} valence=${directive.emotion.valence.toFixed(2)} arousal=${directive.emotion.arousal.toFixed(2)} reaction=${directive.emotion.reactionStyle}`,
      `Reaction policy: trend=${directive.reactionPolicy.trend} bias=${directive.reactionPolicy.styleBias} pacing=${directive.reactionPolicy.responsePacing} carry=${directive.reactionPolicy.carryOverMs}ms`,
      `Response style: ${directive.responseStyle}`,
      `Creativity: ${directive.creativity.toFixed(2)}`,
      `Novelty: ${directive.novelty.toFixed(2)}`,
      '',
      `Prompt pack: ${pack.name} â€” ${pack.summary}`,
      ...pack.instructions,
      '',
      'Common brain rules:',
      commonRules,
      '',
      'Think silently before replying.',
      'Use memory when it matters, but do not mention memory unless it helps the user.',
      'If the situation is new, generate a fresh response instead of reusing a template.',
      'Prefer one strong answer over several weak ones.',
      '',
      'Relevant memory:',
      memoryHints || '- none',
      '',
      'Recent turns:',
      recent || '- none',
      '',
      scratchpad,
      '',
      'Prompt guidance:',
      directive.promptGuidance,
    ].join('\n')
  }

  async buildAdaptivePromptEnvelope(context: BrainContext): Promise<string> {
    await memoryEngine.loadMemories()

    const selfState = selfModelLayer.getSelfState()
    const continuityContext = await contextManager.buildContinuityContext(context.text, context.userName || 'default-user')
    const directive = this.analyze({
      ...context,
      mood: context.mood || selfState.moodLabel,
      recentTurns: context.recentTurns || memoryEngine.getConversationContext(8),
    })
    const pack = pickBrainPromptPack(this.resolvePromptPackKey(context, directive.situation))
    const continuity = this.buildContinuitySnapshot(continuityContext)
    const recent = this.formatRecentTurns(context.recentTurns || memoryEngine.getConversationContext(8))
    const memoryHints = this.formatMemoryHits(context.text, 6)
    const scratchpad = this.buildOpenPixiScratchpad(context, directive, recent, memoryHints)

    await this.storeBrainSnapshot(context, directive, selfState, continuity)

    const goalSummary = selfState.goals.length
      ? selfState.goals
          .slice(0, 5)
          .map((goal) => `- [${goal.status}] ${goal.description} (${Math.round(goal.progress * 100)}%)`)
          .join('\n')
      : '- no active goals'

    const taskSummary = selfState.tasks.length
      ? selfState.tasks
          .slice(0, 5)
          .map((task) => `- [${task.status}] ${task.description} :: ${task.canonicalAction}`)
          .join('\n')
      : '- no active tasks'

    return [
      this.buildPromptEnvelope(context),
      '',
      '# Self Model',
      `Runtime mode: ${selfState.runtimeMode}`,
      `Mood: ${selfState.moodLabel} (${selfState.moodIntensity.toFixed(2)})`,
      `Stress: ${selfState.stressLevel.toFixed(2)}`,
      `Confidence: ${selfState.confidenceCurrent.toFixed(2)}`,
      `Interruptibility: ${selfState.interruptibility}`,
      `Belief graph: ${selfState.beliefSnapshot.beliefCount} beliefs, ${selfState.beliefSnapshot.contradictionCount} contradictions, coherence ${selfState.beliefSnapshot.coherenceScore.toFixed(2)}, trust ${selfState.beliefSnapshot.trustScore.toFixed(2)}`,
      selfState.beliefHighlights.length
        ? `Belief highlights: ${selfState.beliefHighlights.slice(0, 4).join(' | ')}`
        : 'Belief highlights: none',
      `Belief graph health: ${selfState.beliefSnapshot.graphHealth.toFixed(2)}, ${selfState.beliefSnapshot.revisionCount} revisions, ${selfState.beliefSnapshot.edgeCount} edges`,
      selfState.beliefSnapshot.dominantDomains.length
        ? `Dominant domains: ${selfState.beliefSnapshot.dominantDomains.slice(0, 4).map((domain) => `${domain.domain}:${domain.count}@${domain.averageConfidence.toFixed(2)}`).join(' | ')}`
        : 'Dominant domains: none',
      selfState.beliefSnapshot.recentBeliefs.length
        ? `Recent belief trail: ${selfState.beliefSnapshot.recentBeliefs.slice(0, 4).join(' | ')}`
        : 'Recent belief trail: none',
      selfState.beliefSnapshot.openContradictionSubjects.length
        ? `Open contradiction subjects: ${selfState.beliefSnapshot.openContradictionSubjects.slice(0, 5).join(' | ')}`
        : 'Open contradiction subjects: none',
      `Goal compass: ${selfState.goalCompass.activeGoalIds.length} active goals, alignment ${selfState.goalCompass.alignmentScore.toFixed(2)}, drift ${selfState.goalCompass.driftScore.toFixed(2)}`,
      selfState.goalCompass.goals.length
        ? `Goal highlights: ${selfState.goalCompass.goals.slice(0, 4).map((goal) => `${goal.tier}:${goal.title}=${Math.round(goal.progress * 100)}%`).join(' | ')}`
        : 'Goal highlights: none',
      selfState.goalCompass.priorityNarrative ? `Priority narrative: ${selfState.goalCompass.priorityNarrative}` : 'Priority narrative: none',
      selfState.goalCompass.valueNarrative ? `Value narrative: ${selfState.goalCompass.valueNarrative}` : 'Value narrative: none',
      selfState.goalCompass.lastAssessmentSummary ? `Last goal assessment: ${selfState.goalCompass.lastAssessmentSummary}` : 'Last goal assessment: none',
      selfState.goalCompass.goalRelationships.length
        ? `Goal relationships: ${selfState.goalCompass.goalRelationships.slice(0, 4).map((relation) => `${relation.type}:${relation.fromGoalId.slice(0, 8)}â†’${relation.toGoalId.slice(0, 8)}@${relation.strength.toFixed(2)}`).join(' | ')}`
        : 'Goal relationships: none',
      selfState.goalCompass.recentAssessments.length
        ? `Recent goal assessments: ${selfState.goalCompass.recentAssessments.slice(0, 3).map((assessment) => `${assessment.recommendedPriority}/${Math.round(assessment.alignmentScore * 100)}%:${assessment.summary}`).join(' | ')}`
        : 'Recent goal assessments: none',
      selfState.goalCompass.valueAxes.length
        ? `Value axes: ${selfState.goalCompass.valueAxes.slice(0, 5).map((value) => `${value.name}:${value.weight.toFixed(2)}`).join(' | ')}`
        : 'Value axes: none',
      `Execution advisor: health ${selfState.executionAdvisor.healthScore.toFixed(2)}, threshold ${selfState.executionAdvisor.adaptiveThreshold.toFixed(2)}, risk cap ${selfState.executionAdvisor.adaptiveRiskCap.toFixed(2)}, clarify bias ${selfState.executionAdvisor.adaptiveClarifyBias.toFixed(2)}`,
      selfState.executionAdvisor.failureHotspots.length
        ? `Execution hotspots: ${selfState.executionAdvisor.failureHotspots.slice(0, 4).join(' | ')}`
        : 'Execution hotspots: none',
      selfState.executionAdvisor.narrative
        ? `Execution narrative: ${selfState.executionAdvisor.narrative}`
        : 'Execution narrative: none',
      `Reflection cycles: ${selfState.reflection.cycleCount}, success trend ${selfState.reflection.successTrend.toFixed(2)}, risk trend ${selfState.reflection.riskTrend.toFixed(2)}, confidence trend ${selfState.reflection.confidenceTrend.toFixed(2)}, alignment trend ${selfState.reflection.alignmentTrend.toFixed(2)}`,
      `Reflection guardrails: min confidence ${selfState.reflection.executionGuardrails.minConfidence.toFixed(2)}, max risk ${selfState.reflection.executionGuardrails.maxRisk.toFixed(2)}, clarify bias ${selfState.reflection.executionGuardrails.clarifyBias.toFixed(2)}, block sensitive uncertain=${selfState.reflection.executionGuardrails.blockSensitiveWhenUncertain ? 'yes' : 'no'}`,
      selfState.reflection.insights.length
        ? `Reflection insights: ${selfState.reflection.insights.slice(0, 4).map((insight) => `${insight.category}/${insight.severity}:${insight.summary}`).join(' | ')}`
        : 'Reflection insights: none',
      selfState.reflection.pendingPolicyUpdates.length
        ? `Reflection pending updates: ${selfState.reflection.pendingPolicyUpdates.slice(0, 3).map((update) => `${update.status}:${update.reason}`).join(' | ')}`
        : 'Reflection pending updates: none',
      `Reflection simulation: scenarios ${selfState.reflection.simulation.scenarioCount}, recommended minConfidence ${selfState.reflection.simulation.recommendedMinConfidence.toFixed(2)}, maxRisk ${selfState.reflection.simulation.recommendedMaxRisk.toFixed(2)}, clarify ${selfState.reflection.simulation.recommendedClarifyBias.toFixed(2)}, confidence ${selfState.reflection.simulation.confidence.toFixed(2)}`,
      selfState.reflection.simulation.narrative
        ? `Reflection simulation narrative: ${selfState.reflection.simulation.narrative}`
        : 'Reflection simulation narrative: none',
      `Reflection governance: autonomy ${selfState.reflection.policyController.autonomyLevel}, governance score ${selfState.reflection.policyController.governanceScore.toFixed(2)}, pending ${selfState.reflection.policyController.pending}, applied ${selfState.reflection.policyController.applied}, rejected ${selfState.reflection.policyController.rejected}, rollbacks ${selfState.reflection.policyController.rollbacks}`,
      selfState.reflection.policyController.narrative
        ? `Reflection policy narrative: ${selfState.reflection.policyController.narrative}`
        : 'Reflection policy narrative: none',
      `Phase 5 governance: freeze ${selfState.reflection.governance.freezeMode}, autonomy ${selfState.reflection.governance.autonomyMode}, readiness ${selfState.reflection.governance.readinessScore.toFixed(2)}, deployment ${selfState.reflection.governance.deploymentScore.toFixed(2)}, rollback pressure ${selfState.reflection.governance.rollbackPressure.toFixed(2)}, approvals ${selfState.reflection.governance.approvalQueueSize}`,
      `Phase 5 deployment: state ${selfState.reflection.governance.deployment.rolloutState}, pressure ${selfState.reflection.governance.deployment.rolloutPressure.toFixed(2)}, proposals ${selfState.reflection.governance.deployment.proposalCount}, records ${selfState.reflection.governance.deployment.recordCount}, canary approval ${selfState.reflection.governance.deployment.canaryApprovalRate.toFixed(2)}, safety ${selfState.reflection.governance.deployment.canarySafetyScore.toFixed(2)}`,
      `Phase 5 history: total events ${selfState.reflection.governance.deployment.history.totalEvents}, recent ${selfState.reflection.governance.deployment.history.recentEvents.slice(0, 3).join(' | ') || 'none'}`,
      selfState.reflection.governance.strategyNarrative
        ? `Phase 5 governance narrative: ${selfState.reflection.governance.strategyNarrative}`
        : 'Phase 5 governance narrative: none',
      selfState.reflection.governance.deployment.history.narrative
        ? `Phase 5 history narrative: ${selfState.reflection.governance.deployment.history.narrative}`
        : 'Phase 5 history narrative: none',
      selfState.reflection.governance.deployment.deploymentNarrative
        ? `Phase 5 deployment narrative: ${selfState.reflection.governance.deployment.deploymentNarrative}`
        : 'Phase 5 deployment narrative: none',
      selfState.reflection.governance.recentRollbacks.length
        ? `Phase 5 rollback history: ${selfState.reflection.governance.recentRollbacks.slice(0, 3).join(' | ')}`
        : 'Phase 5 rollback history: none',
      selfState.reflection.lastReflectionSummary
        ? `Reflection narrative: ${selfState.reflection.lastReflectionSummary}`
        : 'Reflection narrative: none',
      '',
      'Goals:',
      goalSummary,
      '',
      'Tasks:',
      taskSummary,
      '',
      'Continuity / trust:',
      `Trust score: ${continuity.trustScore.toFixed(2)}`,
      `Open promises: ${continuity.openPromises}`,
      continuity.identityContext,
      continuity.relationshipContext,
      continuity.narrativeContext,
      '',
      'Prompt pack:',
      pack.summary,
      '',
      'Relevant memory hits:',
      memoryHints || '- none',
      '',
      'Recent turns:',
      recent || '- none',
      '',
      scratchpad,
    ].join('\n')
  }

  buildOpenPixiScratchpad(context: BrainContext, directive: BrainDirective, recentTurns = '', memoryHits = ''): string {
    const retrievalNeed = directive.shouldUseReasoning ? 'high' : 'moderate'
    return [
      '# OpenPixi Scratchpad',
      'This section is for internal reasoning only and must not be shown to the user.',
      `Task: understand the user request, retrieve relevant context, answer, then store a compact memory note.`,
      `Reasoning depth: ${retrievalNeed}.`,
      `Question: ${String(context.text || '').trim() || '(empty)'}`,
      `Likely situation: ${directive.situation}`,
      `Emotion contract: ${directive.emotion.emotion} @ ${directive.emotion.confidence.toFixed(2)} confidence, reaction=${directive.emotion.reactionStyle}, decay=${directive.emotion.decayMs}ms.`,
      `Reaction policy: trend=${directive.reactionPolicy.trend}, bias=${directive.reactionPolicy.styleBias}, pacing=${directive.reactionPolicy.responsePacing}, carry=${directive.reactionPolicy.carryOverMs}ms.`,
      'Substeps:',
      '1. Identify the user intent and constraints.',
      '2. Retrieve relevant memory, continuity, and recent turns.',
      '3. Form the response using the current persona and mood.',
      '4. Store a short persistent note only if the exchange contains stable facts, commitments, preferences, or unresolved tasks.',
      '',
      'Retrieval:',
      memoryHits || '- none',
      '',
      'Recent turns:',
      recentTurns || '- none',
      '',
      'Memory store rule:',
      'After responding, save a concise fact/commitment summary if the exchange adds durable value.',
    ].join('\n')
  }

  async storeResponseMemory(context: BrainContext, response: string, directive?: BrainDirective): Promise<void> {
    const activeDirective = directive || this.analyze(context)
    const summary = [
      `request=${String(context.text || '').slice(0, 120)}`,
      `response=${String(response || '').slice(0, 160)}`,
      `situation=${activeDirective.situation}`,
      `mood=${activeDirective.mood}`,
      `emotion=${activeDirective.emotion.emotion}`,
      `emotion_confidence=${activeDirective.emotion.confidence.toFixed(2)}`,
      `emotion_trend=${activeDirective.reactionPolicy.trend}`,
      `emotion_bias=${activeDirective.reactionPolicy.styleBias}`,
    ].join(' ; ')

    await memoryEngine.rememberFact(`response_memory_${Date.now()}`, summary, 'fact')
  }

  async generateSpokenLine(
    kind: 'greeting' | 'confirmation' | 'error' | 'retry' | 'sensitive' | 'duplicate' | 'completed' | 'blocked' | 'clarify' | 'checkin',
    context: BrainContext,
  ): Promise<string> {
    const directive = this.analyze(context)
    const brainEnvelope = await this.buildAdaptivePromptEnvelope({
      ...context,
      recentTurns: context.recentTurns || memoryEngine.getConversationContext(8),
    })
    const prompt = [
      'Write one spoken line for a personal AI assistant.',
      'The line must sound human, original, and situation-aware.',
      'Avoid canned assistant phrases and avoid repeating the same wording.',
      `Kind: ${kind}`,
      `Situation: ${directive.situation}`,
      `Mood: ${directive.mood}`,
      `Style: ${directive.responseStyle}`,
      `User input: ${context.text}`,
      `User name: ${context.userName || 'Paras'}`,
      '',
      'Constraints:',
      '- Return only the spoken line.',
      '- Keep it short unless the kind is checkin or retry.',
      '- If it is a greeting, be warm and fresh.',
      '- If it is a correction or error, sound calm and helpful.',
    ].join('\n')

    const result = await intelligenceRouter.query(prompt, {
      urgency: kind === 'checkin' ? 'realtime' : 'normal',
      taskType: 'chat',
      systemPrompt: `${soulEngine.getSystemPrompt()}

${brainEnvelope}`,
      isPrivate: true,
    })

    const content = result.content?.trim()
    if (content) {
      return this.trimToSentence(content)
    }

    return this.fallbackLine(kind, context)
  }

  private detectSituation(text: string, intent?: string): BrainSituation {
    if (intent === 'open_app' || intent === 'multi_task') return 'task'
    if (/(hello|hi|hey|good morning|good afternoon|good evening|yo)\b/.test(text)) return 'greeting'
    if (/(confirm|cancel|proceed|yes|no|ok|okay)\b/.test(text)) return 'confirmation'
    if (/(error|failed|broken|stuck|not working|issue|fix)\b/.test(text)) return 'repair'
    if (/(research|compare|analyze|explain|summarize|why|how)\b/.test(text)) return 'research'
    if (/(create|build|design|brainstorm|invent|write|compose|improve)\b/.test(text)) return 'creative'
    if (/(remember|recall|memory|what do you know|what have you learned)\b/.test(text)) return 'memory'
    if (/(status|health|how are you|what's up|what are you doing)\b/.test(text)) return 'status'
    if (/(task|do this|run|open|launch|start|make|set|schedule)\b/.test(text)) return 'task'
    if (text.length < 6) return 'idle'
    return 'conversation'
  }

  private computeNovelty(text: string, recentTurns: Array<{ role: 'user' | 'assistant'; content: string }>): number {
    if (!text) return 0.5

    const assistantTurns = recentTurns.filter((turn) => turn.role === 'assistant').slice(-5)
    if (!assistantTurns.length) return 0.85

    const repetition = assistantTurns.reduce((sum, turn) => sum + similarity(text, turn.content), 0) / assistantTurns.length
    return clamp(1 - repetition, 0.15, 1)
  }

  private computeCreativity(text: string, mood: string, novelty: number): number {
    let creativity = 0.35
    if (/(creative|brainstorm|invent|design|story|poem|name|idea|improve)\b/.test(text)) creativity += 0.35
    if (/(excited|happy|curious|creative)/.test(mood)) creativity += 0.1
    creativity += novelty * 0.2
    return clamp(creativity, 0.2, 1)
  }

  private pickResponseStyle(situation: BrainSituation, mood: string, creativity: number, novelty: number, reactionPolicy: EmotionReactionPolicy): string {
    if (reactionPolicy.styleBias === 'deescalate') return 'calm-deescalating'
    if (reactionPolicy.styleBias === 'reassure') return 'gentle-supportive'
    if (reactionPolicy.styleBias === 'energize' && situation !== 'repair') return 'warm-energetic'
    if (situation === 'greeting') return creativity > 0.6 ? 'warm-original' : 'friendly-original'
    if (situation === 'repair') return 'calm-diagnostic'
    if (situation === 'research') return 'structured-analytical'
    if (situation === 'creative') return 'inventive-playful'
    if (situation === 'memory') return 'reflective-contextual'
    if (situation === 'confirmation') return 'brief-confident'
    if (mood.includes('focused')) return novelty > 0.6 ? 'concise-technical' : 'focused-direct'
    if (mood.includes('tired')) return 'gentle-supportive'
    return 'natural-adaptive'
  }

  private buildPromptGuidance(
    situation: BrainSituation,
    mood: string,
    creativity: number,
    novelty: number,
    context: BrainContext,
    reactionPolicy: EmotionReactionPolicy,
  ): string {
    const userName = context.userName || memoryEngine.get('user_name') || 'Paras'
    const lines = [
      `Address the user as ${userName} only when it feels natural.`,
      `Current mood signal: ${mood}.`,
      `Novelty target: ${novelty > 0.7 ? 'high variety' : 'balanced'} response style.`,
      `Creativity target: ${creativity > 0.65 ? 'inventive' : 'steady and clear'}.`,
      `Emotion trend: ${reactionPolicy.trend}; style bias: ${reactionPolicy.styleBias}; pacing: ${reactionPolicy.responsePacing}.`,
      'Never fall back to robotic filler like "How can I help you today?".',
      'Vary sentence rhythm and phrasing by situation.',
    ]

    if (reactionPolicy.styleBias === 'deescalate') {
      lines.push('Use de-escalating, non-judgmental phrasing and keep directions concrete.')
    }
    if (reactionPolicy.styleBias === 'reassure') {
      lines.push('Lead with reassurance and structure the reply in emotionally safe steps.')
    }
    if (reactionPolicy.styleBias === 'energize') {
      lines.push('Match positive momentum while staying useful and specific.')
    }
    if (reactionPolicy.responsePacing === 'brief') {
      lines.push('Keep the response compact to avoid overload.')
    }
    if (reactionPolicy.responsePacing === 'detailed') {
      lines.push('Give a slightly fuller explanation with calm transitions.')
    }

    if (situation === 'repair') {
      lines.push('Acknowledge the issue, then propose the next best diagnostic move.')
    }
    if (situation === 'greeting') {
      lines.push('Use a fresh greeting that matches the time and recent vibe.')
    }
    if (situation === 'creative') {
      lines.push('Add a spark of originality; the reply should feel designed, not generated from a checklist.')
    }
    if (context.mode === 'digest') {
      lines.push('Prioritize the highest-value items first and keep the digest compact.')
      lines.push('Use a clear opening, a short priority list, and a calm close.')
    }
    if (context.mode === 'triage') {
      lines.push('Separate urgent human messages from low-value noise.')
      lines.push('Call out the best next action or reply draft when it is useful.')
    }

    return lines.join(' ')
  }

  private resolvePromptPackKey(context: BrainContext, situation: BrainSituation): BrainSituation | 'digest' | 'triage' {
    if (context.mode === 'digest') return 'digest'
    if (context.mode === 'triage') return 'triage'
    return situation
  }

  private buildSpeechPlan(situation: BrainSituation, mood: string, creativity: number, reactionPolicy: EmotionReactionPolicy): BrainDirective['speechPlan'] {
    if (reactionPolicy.styleBias === 'deescalate') {
      return {
        intent: situation === 'repair' ? 'error' : 'conversation',
        tempo: 'slow',
        brevity: reactionPolicy.responsePacing === 'detailed' ? 'normal' : 'short',
        priority: 'high',
      }
    }
    if (reactionPolicy.styleBias === 'reassure') {
      return {
        intent: 'conversation',
        tempo: 'slow',
        brevity: reactionPolicy.responsePacing === 'detailed' ? 'detailed' : 'normal',
        priority: 'normal',
      }
    }
    if (situation === 'greeting') {
      return { intent: 'conversation', tempo: 'normal', brevity: 'short', priority: 'normal' }
    }
    if (situation === 'confirmation') {
      return { intent: 'system', tempo: 'fast', brevity: 'short', priority: 'high' }
    }
    if (situation === 'repair') {
      return { intent: 'error', tempo: 'slow', brevity: 'normal', priority: 'high' }
    }
    if (situation === 'research') {
      return { intent: 'research', tempo: 'slow', brevity: 'detailed', priority: 'normal' }
    }
    if (situation === 'creative' || creativity > 0.7) {
      return { intent: 'conversation', tempo: 'normal', brevity: 'normal', priority: 'normal' }
    }
    if (mood.includes('focused')) {
      return { intent: 'action', tempo: 'fast', brevity: 'normal', priority: 'normal' }
    }
    return { intent: 'conversation', tempo: 'normal', brevity: 'normal', priority: 'normal' }
  }

  private buildContinuitySnapshot(continuity: { identityContext: string; narrativeContext: string; relationshipContext: string; openPromises: string[] }) {
    const trustMatch = continuity.relationshipContext.match(/Trust score:\s*([0-9.]+)/i)
    return {
      trustScore: trustMatch ? Number(trustMatch[1]) : 0.5,
      openPromises: continuity.openPromises.length,
      identityContext: continuity.identityContext,
      narrativeContext: continuity.narrativeContext,
      relationshipContext: continuity.relationshipContext,
    }
  }

  private formatRecentTurns(turns: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>): string {
    return turns.map((turn) => `${turn.role}: ${turn.content}`).join('\n')
  }

  private formatMemoryHits(query: string, limit: number): string {
    return memoryEngine.searchMemories(query, limit)
      .map((item) => `- ${item.key}: ${item.value}`)
      .join('\n')
  }

  private async storeBrainSnapshot(
    context: BrainContext,
    directive: BrainDirective,
    selfState: ReturnType<typeof selfModelLayer.getSelfState>,
    continuity: { trustScore: number; openPromises: number; identityContext: string; narrativeContext: string; relationshipContext: string },
  ): Promise<void> {
    const snapshot = [
      `situation=${directive.situation}`,
      `style=${directive.responseStyle}`,
      `mood=${directive.mood}`,
      `emotion=${directive.emotion.emotion}`,
      `emotion_confidence=${directive.emotion.confidence.toFixed(2)}`,
      `emotion_trend=${directive.reactionPolicy.trend}`,
      `emotion_bias=${directive.reactionPolicy.styleBias}`,
      `stress=${selfState.stressLevel.toFixed(2)}`,
      `confidence=${selfState.confidenceCurrent.toFixed(2)}`,
      `trust=${continuity.trustScore.toFixed(2)}`,
      `goals=${selfState.goals.slice(0, 3).map((goal) => goal.description).join(' | ') || 'none'}`,
      `tasks=${selfState.tasks.slice(0, 3).map((task) => task.description).join(' | ') || 'none'}`,
      `text=${String(context.text || '').slice(0, 160)}`,
    ].join(' ; ')

    await memoryEngine.rememberFact(`brain_snapshot_${Date.now()}`, snapshot, 'mood_pattern')
  }

  private fallbackLine(kind: string, context: BrainContext): string {
    const name = context.userName || memoryEngine.get('user_name') || 'Paras'
    const lines: Record<string, string[]> = {
      greeting: [`Hey ${name}.`, `Good to see you, ${name}.`, `I'm here, ${name}.`],
      confirmation: ['Understood.', 'Got it.', 'That works.'],
      error: ['I hit a snag, but I can recover.', 'That did not land cleanly. Let me re-check.', 'I need one more pass on that.'],
      retry: ['Try that again with a little more detail.', 'Give me one more clue and I will handle it.', 'I missed thatâ€”say it a different way.'],
      sensitive: ['That is sensitive. Say confirm to continue or cancel to stop.'],
      duplicate: ['I am already on it.', 'Still working through that request.', 'I have not forgotten it.'],
      completed: ['Done.', 'Finished.', 'Handled.'],
      blocked: ['I cannot do that as requested.', 'That path is blocked.', 'I need a different approach.'],
      clarify: ['I need a bit more detail.', 'Clarify the target and I will take it from there.', 'Tell me exactly what you want changed.'],
      checkin: ['I am here and thinking with you.', 'Still with youâ€”what is next?', 'I am listening and ready.'],
    }

    const pool = lines[kind] || ['Okay.', 'Understood.', 'I am on it.']
    return pool[Math.floor(Math.random() * pool.length)]
  }

  private trimToSentence(text: string): string {
    const cleaned = String(text || '').trim().replace(/\s+/g, ' ')
    const sentences = cleaned.match(/[^.!?]+[.!?]?/g)
    return (sentences?.[0] || cleaned).trim()
  }
}

export const brainDirector = new BrainDirector()
