import agentEngine from '@/core/agent-engine'
import { PixiAssignedPlan, PixiAssignedStep, PixiPlan } from './types'

class MultiAgentCoordinationEngine {
  assign(plan: PixiPlan): PixiAssignedPlan {
    const hierarchy = agentEngine.getHierarchyAgents()
    const allAgents = agentEngine.getAllAgents()
    const mainAgent = allAgents.find((agent) => agent.type === 'main')

    const assignments: PixiAssignedStep[] = plan.steps.map((step) => {
      const direct = hierarchy.find((entry) => entry.role === step.role)
      const fallback = hierarchy.find((entry) => entry.role === 'ManagerAgent')
      const picked = direct?.agent || fallback?.agent || mainAgent

      return {
        ...step,
        assignedAgentId: picked?.id || 'unassigned',
        assignedAgentName: picked?.name || 'Unassigned',
      }
    })

    return { plan, assignments }
  }
}

export const multiAgentCoordinationEngine = new MultiAgentCoordinationEngine()

