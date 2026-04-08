import agentEngine from '@/core/agent-engine'
import { JarvisAssignedPlan, JarvisAssignedStep, JarvisPlan } from './types'

class MultiAgentCoordinationEngine {
  assign(plan: JarvisPlan): JarvisAssignedPlan {
    const hierarchy = agentEngine.getHierarchyAgents()
    const allAgents = agentEngine.getAllAgents()
    const mainAgent = allAgents.find((agent) => agent.type === 'main')

    const assignments: JarvisAssignedStep[] = plan.steps.map((step) => {
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
