import { eventPublisher } from '@/event_system/event_publisher'
import { JarvisAgentRole, JarvisPlan, JarvisPlanStep, JarvisStepKind } from './types'

function makeStep(
  id: string,
  title: string,
  description: string,
  kind: JarvisStepKind,
  role: JarvisAgentRole,
  skillHints: string[],
  dependsOn: string[] = [],
  requiresApproval = false,
): JarvisPlanStep {
  return {
    id,
    title,
    description,
    kind,
    role,
    skillHints,
    dependsOn,
    requiresApproval,
  }
}

class CognitivePlanningEngine {
  createPlan(goal: string): JarvisPlan {
    const normalized = goal.trim()
    const lower = normalized.toLowerCase()
    const steps = this.buildSteps(lower, normalized)

    const plan = {
      id: `plan_${Date.now()}`,
      goal: normalized,
      interpretedIntent: this.interpretIntent(lower),
      createdAt: Date.now(),
      steps,
    }

    void eventPublisher.planCreated(
      {
        planId: plan.id,
        goal: plan.goal,
        stepCount: plan.steps.length,
        intent: plan.interpretedIntent,
      },
      'planner',
    )

    return plan
  }

  private interpretIntent(lowerGoal: string): string {
    if (/(youtube|video|script|voiceover|visual|edit)/.test(lowerGoal)) return 'creative_production'
    if (/(code|build|debug|project|app|website|refactor)/.test(lowerGoal)) return 'development_automation'
    if (/(market|stock|finance|trend|analysis|news)/.test(lowerGoal)) return 'market_analysis'
    if (/(research|investigate|compare|study|summarize)/.test(lowerGoal)) return 'deep_research'
    if (/(automate|workflow|orchestrate|pipeline|multi-step)/.test(lowerGoal)) return 'workflow_orchestration'
    return 'general_orchestration'
  }

  private buildSteps(lowerGoal: string, originalGoal: string): JarvisPlanStep[] {
    if (/(youtube|video|script|voiceover|visual|edit)/.test(lowerGoal)) {
      return [
        makeStep('s1', 'Research Topic', `Research the topic context for: ${originalGoal}`, 'research', 'ResearchAgent', ['summarize_article', 'research_topic']),
        makeStep('s2', 'Write Script', 'Generate a structured video script with hook, body, and CTA.', 'creative', 'CommunicationAgent', ['generate_script', 'summarize_document'], ['s1']),
        makeStep('s3', 'Generate Visuals', 'Create visual prompts and rendering assets for the script.', 'creative', 'VideoAgent', ['generate_video', 'generate_visuals'], ['s2']),
        makeStep('s4', 'Generate Voiceover', 'Create voiceover text and narration guidance aligned to visuals.', 'creative', 'CommunicationAgent', ['generate_voiceover'], ['s2']),
        makeStep('s5', 'Assemble Video', 'Assemble script, visuals, and voiceover into final output.', 'creative', 'VideoAgent', ['assemble_video'], ['s3', 's4']),
      ]
    }

    if (/(code|build|debug|project|app|website|refactor)/.test(lowerGoal)) {
      return [
        makeStep('s1', 'Analyze Development Goal', `Break down development objective: ${originalGoal}`, 'analysis', 'CodingAgent', ['analyze_dataset', 'summarize_article']),
        makeStep('s2', 'Generate Implementation', 'Generate or update project code and structure.', 'code', 'CodingAgent', ['generate_code', 'create_website'], ['s1']),
        makeStep('s3', 'Run Build and Validation', 'Execute build/test loop and collect errors.', 'code', 'AutomationAgent', ['run_build', 'debug_errors'], ['s2']),
        makeStep('s4', 'Produce Delivery Notes', 'Summarize implementation, risks, and next actions.', 'summary', 'CommunicationAgent', ['summarize_document'], ['s3']),
      ]
    }

    if (/(market|stock|finance|trend|analysis|news)/.test(lowerGoal)) {
      return [
        makeStep('s1', 'Collect Market Data', `Gather relevant market data and news for: ${originalGoal}`, 'market', 'ResearchAgent', ['market_data', 'financial_news']),
        makeStep('s2', 'Analyze Trends', 'Analyze historical and recent trend signals.', 'analysis', 'AnalysisAgent', ['analyze_dataset', 'trend_analysis'], ['s1']),
        makeStep('s3', 'Generate Market Report', 'Produce a structured market research report with patterns and caveats.', 'summary', 'CommunicationAgent', ['summarize_article'], ['s2']),
      ]
    }

    return [
      makeStep('s1', 'Research Context', `Gather context and facts for: ${originalGoal}`, 'research', 'ResearchAgent', ['summarize_article']),
      makeStep('s2', 'Plan Execution', 'Create an actionable execution strategy and tool sequence.', 'analysis', 'ManagerAgent', ['workflow_plan'], ['s1']),
      makeStep('s3', 'Execute Skills', 'Run selected skills and tool workflows.', 'automation', 'AutomationAgent', ['execute_skill', 'automate_workflow'], ['s2']),
      makeStep('s4', 'Integrate Results', 'Combine outputs into a final result summary.', 'summary', 'CommunicationAgent', ['summarize_document'], ['s3']),
    ]
  }
}

export const cognitivePlanningEngine = new CognitivePlanningEngine()
