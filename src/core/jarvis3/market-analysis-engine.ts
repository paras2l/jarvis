import { providerMatrixRouter } from '@/core/provider-matrix-router'
import { researchKnowledgeEngine } from './research-knowledge-engine'
import { securityApprovalEngine } from './security-approval-engine'

class MarketAnalysisEngine {
  private readonly restrictedActions = /(buy|sell|trade|place order|execute trade|transfer funds)/i

  async analyze(goal: string): Promise<{ success: boolean; output: string; data?: Record<string, unknown> }> {
    const research = await researchKnowledgeEngine.gather(goal)

    const analysis = await providerMatrixRouter.query(
      [
        'You are a market research analyst.',
        'Summarize trends, risks, and possible patterns from the data.',
        'Do not issue autonomous trading instructions.',
        `Goal: ${goal}`,
        `Research summary: ${research.summary}`,
      ].join('\n'),
      { taskClass: 'research', urgency: 'normal' },
    )

    return {
      success: true,
      output: analysis.content,
      data: {
        sources: research.sources,
        confidence: research.confidence,
        disclaimer: 'Analysis only. No trades executed by Jarvis.',
      },
    }
  }

  async guardTradingAction(actionText: string): Promise<{ allowed: boolean; reason: string }> {
    if (!this.restrictedActions.test(actionText)) {
      return { allowed: true, reason: 'No trading action detected.' }
    }

    const decision = await securityApprovalEngine.requestApproval(
      actionText,
      'Financial or trading actions require explicit user confirmation.',
      { category: 'market' },
    )

    return {
      allowed: decision.approved,
      reason: decision.reason || 'User approval required for trading actions.',
    }
  }
}

export const marketAnalysisEngine = new MarketAnalysisEngine()
