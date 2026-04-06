export interface RouteInventoryItem {
  routeId: string
  route: string
  layer: 'agent-engine' | 'task-executor' | 'protocol' | 'ui'
  policyWrapped: boolean
  risk: 'low' | 'medium' | 'high' | 'critical'
}

// Week 1 inventory baseline. Expand as new execution routes are introduced.
export const POLICY_ROUTE_INVENTORY: RouteInventoryItem[] = [
  {
    routeId: 'agent-local-exec',
    route: 'AgentEngine.executeLocalTask',
    layer: 'agent-engine',
    policyWrapped: true,
    risk: 'high',
  },
  {
    routeId: 'agent-remote-exec',
    route: 'AgentEngine.executeRemoteTask',
    layer: 'agent-engine',
    policyWrapped: true,
    risk: 'critical',
  },
  {
    routeId: 'route-and-execute',
    route: 'AgentEngine.routeAndExecuteTask',
    layer: 'agent-engine',
    policyWrapped: true,
    risk: 'high',
  },
  {
    routeId: 'executive-execute-app-task',
    route: 'AppExecutiveController.executeAppTask',
    layer: 'protocol',
    policyWrapped: true,
    risk: 'high',
  },
  {
    routeId: 'executive-execute-step',
    route: 'AppExecutiveController.executeStep',
    layer: 'protocol',
    policyWrapped: true,
    risk: 'critical',
  },
  {
    routeId: 'task-executor-execute-task',
    route: 'TaskExecutor.executeTask',
    layer: 'task-executor',
    policyWrapped: true,
    risk: 'high',
  },
  {
    routeId: 'task-executor-launch-app',
    route: 'TaskExecutor.launchApp',
    layer: 'task-executor',
    policyWrapped: true,
    risk: 'critical',
  },
  {
    routeId: 'task-executor-screen-control',
    route: 'TaskExecutor.executeScreenControlTask',
    layer: 'task-executor',
    policyWrapped: true,
    risk: 'critical',
  },
]
