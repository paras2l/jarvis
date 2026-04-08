import { providerMatrixRouter } from '@/core/provider-matrix-router'
import { runtimeEventBus, RuntimeContextSnapshot } from '@/core/event-bus'
import { cognitivePlanningEngine } from './cognitive-planning-engine'
import { multiAgentCoordinationEngine } from './multi-agent-coordination-engine'
import { skillExecutionEngine } from './skill-execution-engine'
import { researchKnowledgeEngine } from './research-knowledge-engine'
import { creativeProductionEngine } from './creative-production-engine'
import { developmentAutomationEngine } from './development-automation-engine'
import { marketAnalysisEngine } from './market-analysis-engine'
import { initiativePredictionEngine } from './initiative-prediction-engine'
import { memoryLearningEngine } from './memory-learning-engine'
import { securityApprovalEngine } from './security-approval-engine'
import { realTimeContextEngine } from './real-time-context-engine'
import { worldModelingEngine } from './world-modeling-engine'
import { JarvisExecutionReport, JarvisPlanStep, JarvisStepExecutionResult } from './types'

interface ExecuteGoalOptions {
  approvalHandler?: (request: { id: string; action: string; reason: string; payload?: Record<string, unknown> }) => Promise<{ approved: boolean; reason?: string }> | { approved: boolean; reason?: string }
  contextSnapshot?: RuntimeContextSnapshot
}

interface CognitiveCycleOptions {
  allowAutonomousExecution?: boolean
  maxAutoGoals?: number
}

class JarvisOperatingSystem {
  shouldUseOrchestration(goal: string): boolean {
    const lower = goal.toLowerCase().trim()
    if (lower.length > 90) return true
    if (/(then|after that|step by step|workflow|pipeline|multi-step|research and|create .* and)/.test(lower)) return true
    if (/(video|market|analysis|build|project|website|automation)/.test(lower)) return true
    return false
  }

  async executeGoal(goal: string, options: ExecuteGoalOptions = {}): Promise<JarvisExecutionReport> {
    if (options.approvalHandler) {
      securityApprovalEngine.registerApprovalHandler(options.approvalHandler)
    }

    const plan = cognitivePlanningEngine.createPlan(goal)
    const contextModel = options.contextSnapshot
      ? realTimeContextEngine.build(options.contextSnapshot)
      : undefined
    const worldModelDecision = contextModel
      ? worldModelingEngine.simulate(goal, plan, contextModel)
      : undefined
    const assigned = multiAgentCoordinationEngine.assign(plan)
    const results: JarvisStepExecutionResult[] = []

    for (const step of assigned.assignments) {
      const dependencyFailure = step.dependsOn.some((dep) => {
        const depResult = results.find((item) => item.stepId === dep)
        return depResult && depResult.status !== 'completed'
      })

      if (dependencyFailure) {
        results.push({
          stepId: step.id,
          status: 'blocked',
          output: 'Step blocked due to dependency failure.',
          startedAt: Date.now(),
          finishedAt: Date.now(),
        })
        continue
      }

      const startedAt = Date.now()
      const approval = await this.checkApproval(step, goal)
      if (!approval.approved) {
        results.push({
          stepId: step.id,
          status: 'blocked',
          output: approval.reason || 'Execution blocked pending approval.',
          error: approval.reason,
          startedAt,
          finishedAt: Date.now(),
        })
        continue
      }

      try {
        const executed = await this.executeStep(step, goal)
        results.push({
          stepId: step.id,
          status: executed.success ? 'completed' : 'failed',
          output: executed.output,
          data: executed.data,
          error: executed.success ? undefined : executed.output,
          startedAt,
          finishedAt: Date.now(),
        })
      } catch (error) {
        results.push({
          stepId: step.id,
          status: 'failed',
          output: error instanceof Error ? error.message : String(error),
          error: error instanceof Error ? error.message : String(error),
          startedAt,
          finishedAt: Date.now(),
        })
      }
    }

    const completed = results.filter((result) => result.status === 'completed').length
    const failed = results.filter((result) => result.status === 'failed').length
    const status: JarvisExecutionReport['status'] = failed === 0
      ? 'completed'
      : completed > 0
        ? 'partial'
        : 'failed'

    const summary = await this.buildSummary(goal, results)
    const report: JarvisExecutionReport = {
      plan,
      status,
      summary,
      results,
      completedAt: Date.now(),
      context: contextModel,
      worldModelDecision,
    }

    await memoryLearningEngine.recordReport(report)
    await runtimeEventBus.emit('task.executed', {
      id: plan.id,
      success: status !== 'failed',
      result: report,
      error: status === 'failed' ? summary : undefined,
    })

    return report
  }

  async suggestInitiatives(context: RuntimeContextSnapshot): Promise<string[]> {
    return initiativePredictionEngine.suggest(context)
  }

  async runCognitiveCycle(
    snapshot: RuntimeContextSnapshot,
    options: CognitiveCycleOptions = {},
  ): Promise<{ initiatives: string[]; inferredGoals: string[]; executedPlanIds: string[] }> {
    const contextModel = realTimeContextEngine.build(snapshot)
    const inferredGoals = realTimeContextEngine.inferGoals(contextModel)
    const initiatives = await this.suggestInitiatives(snapshot)
    const executedPlanIds: string[] = []

    const allowAutonomousExecution = Boolean(options.allowAutonomousExecution)
    const maxAutoGoals = Math.max(0, options.maxAutoGoals ?? 1)

    if (allowAutonomousExecution && !snapshot.systemBusy && maxAutoGoals > 0) {
      for (const goal of inferredGoals.slice(0, maxAutoGoals)) {
        if (!this.shouldUseOrchestration(goal)) continue
        const report = await this.executeGoal(goal, { contextSnapshot: snapshot })
        executedPlanIds.push(report.plan.id)
      }
    }

    await runtimeEventBus.emit('prediction.generated', {
      prediction: {
        id: `cognitive_loop_${Date.now()}`,
        reason: `Context-aware loop processed. Urgency: ${contextModel.contextUrgency}`,
        confidence: 0.74,
        suggestedAction: inferredGoals[0] || 'monitor_context',
      },
    })

    return {
      initiatives,
      inferredGoals,
      executedPlanIds,
    }
  }

  private async checkApproval(step: JarvisPlanStep, goal: string): Promise<{ approved: boolean; reason?: string }> {
    const action = `${step.title}: ${goal}`

    if (step.kind === 'market') {
      const guard = await marketAnalysisEngine.guardTradingAction(action)
      if (!guard.allowed) return { approved: false, reason: guard.reason }
    }

    if (!step.requiresApproval) {
      return { approved: true }
    }

    return securityApprovalEngine.requestApproval(action, `Approval required for step: ${step.title}`, {
      stepId: step.id,
      kind: step.kind,
    })
  }

  private async executeStep(step: JarvisPlanStep, goal: string): Promise<{ success: boolean; output: string; data?: Record<string, unknown> }> {
    if (step.kind === 'research') {
      const brief = await researchKnowledgeEngine.gather(`${step.description}\nGoal: ${goal}`)
      return {
        success: true,
        output: brief.summary,
        data: {
          sources: brief.sources,
          confidence: brief.confidence,
        },
      }
    }

    if (step.kind === 'creative') {
      return creativeProductionEngine.createFromGoal(goal)
    }

    if (step.kind === 'code') {
      return developmentAutomationEngine.execute(goal)
    }

    if (step.kind === 'market') {
      return marketAnalysisEngine.analyze(goal)
    }

    if (step.kind === 'analysis') {
      const response = await providerMatrixRouter.query(
        `Analyze this task step and provide actionable output:\nStep: ${step.title}\nDescription: ${step.description}\nGoal: ${goal}`,
        { taskClass: 'reasoning', urgency: 'normal' },
      )
      return {
        success: true,
        output: response.content,
      }
    }

    if (step.kind === 'summary') {
      const response = await providerMatrixRouter.query(
        `Create a concise execution summary for:\nGoal: ${goal}\nStep: ${step.title}\nDescription: ${step.description}`,
        { taskClass: 'chat', urgency: 'normal' },
      )
      return {
        success: true,
        output: response.content,
      }
    }

    return skillExecutionEngine.executeStep(step, goal)
  }

  private async buildSummary(goal: string, results: JarvisStepExecutionResult[]): Promise<string> {
    const brief = results
      .map((result) => `- ${result.stepId}: ${result.status} | ${result.output.slice(0, 180)}`)
      .join('\n')

    const response = await providerMatrixRouter.query(
      `Summarize this orchestration report in operational language.\nGoal: ${goal}\nResults:\n${brief}`,
      { taskClass: 'chat', urgency: 'normal' },
    )

    return response.content || `Completed ${results.length} planned steps for goal: ${goal}`
  }
}

export const jarvisOS = new JarvisOperatingSystem()
