import { globalWorkspaceLayer } from '@/layers/global_workspace/global_workspace_layer'
import { identityCore } from './identity_core'
import { narrativeMemory } from './narrative_memory'
import { relationshipTracker } from './relationship_tracker'
import { identityEventLogger } from './event_logger'

export interface ContinuityContext {
  identityContext: string
  narrativeContext: string
  relationshipContext: string
  openPromises: string[]
}

class ContextManager {
  async warmup(): Promise<void> {
    await identityCore.warmup()
    await narrativeMemory.warmup()
    await relationshipTracker.warmup()
  }

  async recordConversationTurn(input: { userId: string; userText: string; assistantText?: string }): Promise<void> {
    await this.warmup()
    await relationshipTracker.recordInteraction(input.userId)

    await narrativeMemory.append({
      type: 'conversation',
      summary: `User: ${input.userText}`,
      source: 'context-manager',
      importance: 0.45,
      metadata: {
        userId: input.userId,
      },
    })

    if (input.assistantText) {
      await narrativeMemory.append({
        type: 'conversation',
        summary: `Assistant: ${input.assistantText}`,
        source: 'context-manager',
        importance: 0.4,
        metadata: {
          userId: input.userId,
        },
      })
    }
  }

  async buildContinuityContext(query: string, userId = 'default-user'): Promise<ContinuityContext> {
    await this.warmup()
    const identityContext = identityCore.buildIdentityContext()

    const relevant = narrativeMemory.queryRelevant(query, 6)
    const narrativeContext = relevant.length
      ? relevant
          .map((event) => `${new Date(event.timestamp).toLocaleString()}: ${event.summary}`)
          .join('\n')
      : 'No highly relevant narrative event found.'

    const rel = relationshipTracker.getState()
    const openPromises = relationshipTracker.getOpenPromises().map((promise) => promise.text)

    const relationshipContext = [
      `User id: ${userId}`,
      `Tracked relationship user: ${rel.userId}`,
      `Interactions: ${rel.interactionCount}`,
      `Trust score: ${rel.trustScore.toFixed(2)}`,
      `Priority score: ${rel.priorityScore.toFixed(2)}`,
    ].join('\n')

    return {
      identityContext,
      narrativeContext,
      relationshipContext,
      openPromises,
    }
  }

  async publishContextToWorkspace(query: string, userId = 'default-user'): Promise<void> {
    const continuity = await this.buildContinuityContext(query, userId)

    await globalWorkspaceLayer.publishPerception({
      source: 'memory',
      content: `Continuity context generated for query: ${query}`,
      confidence: 0.83,
      metadata: {
        continuity,
      },
    })

    await identityEventLogger.log({
      eventType: 'context_resolution',
      source: 'context-manager',
      summary: 'Continuity context resolved and published to workspace',
      impact: 'low',
      payload: {
        query,
        userId,
        openPromises: continuity.openPromises.length,
      },
    })
  }
}

export const contextManager = new ContextManager()
