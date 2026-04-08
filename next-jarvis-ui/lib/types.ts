export type AppSection =
  | "dashboard"
  | "command-center"
  | "agents"
  | "research"
  | "memory"
  | "automation"
  | "developer"
  | "settings";

export interface SystemMetrics {
  agentCount: number;
  computeUsagePct: number;
  apiUsagePct: number;
  activeTasks: number;
  healthScore: number;
}

export interface CommandMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  reasoningSteps?: string[];
  agentActivity?: string[];
}

export interface AgentState {
  id: string;
  role: string;
  status: "idle" | "running" | "blocked" | "error";
  task: string;
  updatedAt: string;
}

export interface DiscoveryItem {
  id: string;
  title: string;
  summary: string;
  confidence: number;
  source: string;
  timestamp: string;
}

export interface MemoryRecord {
  id: string;
  namespace: string;
  key: string;
  value: string;
  updatedAt: string;
}

export interface WorkflowItem {
  id: string;
  name: string;
  enabled: boolean;
  lastRun: string;
  status: "healthy" | "degraded" | "failed";
}

export interface BusEvent {
  id: string;
  topic: string;
  source: string;
  severity: "info" | "warning" | "error";
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface UiSettings {
  apiGatewayUrl: string;
  websocketUrl: string;
  eventStreamUrl: string;
  model: string;
  apiKeyMasked: string;
  theme: "light" | "dark";
}
