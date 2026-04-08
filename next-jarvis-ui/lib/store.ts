"use client";

import { create } from "zustand";
import { ApiGatewayClient } from "@/lib/api-gateway";
import {
  AgentState,
  AppSection,
  BusEvent,
  CommandMessage,
  DiscoveryItem,
  MemoryRecord,
  SystemMetrics,
  UiSettings,
  WorkflowItem
} from "@/lib/types";

interface UiState {
  section: AppSection;
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
  metrics: SystemMetrics;
  commandMessages: CommandMessage[];
  agents: AgentState[];
  discoveries: DiscoveryItem[];
  memoryRecords: MemoryRecord[];
  workflows: WorkflowItem[];
  logs: string[];
  busEvents: BusEvent[];
  settings: UiSettings;
  connections: {
    restHealthy: boolean;
    wsConnected: boolean;
    streamConnected: boolean;
  };
  setSection: (section: AppSection) => void;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  setTheme: (theme: "light" | "dark") => void;
  setConnections: (value: Partial<UiState["connections"]>) => void;
  appendBusEvent: (event: BusEvent) => void;
  sendCommand: (text: string) => Promise<void>;
  loadMemory: () => Promise<void>;
  saveMemory: (record: MemoryRecord) => Promise<void>;
  loadWorkflows: () => Promise<void>;
  toggleWorkflow: (workflowId: string, enabled: boolean) => Promise<void>;
}

const nowIso = () => new Date().toISOString();

const initialSettings: UiSettings = {
  apiGatewayUrl: "http://localhost:8080/api/gateway",
  websocketUrl: "ws://localhost:8080/ws/events",
  eventStreamUrl: "http://localhost:8080/events/stream",
  model: "gpt-5.3-codex",
  apiKeyMasked: "sk-****-****",
  theme: "dark"
};

let apiClient = new ApiGatewayClient(initialSettings.apiGatewayUrl);

export const useUiStore = create<UiState>((set, get) => ({
  section: "dashboard",
  sidebarOpen: false,
  rightPanelOpen: false,
  metrics: {
    agentCount: 6,
    computeUsagePct: 48,
    apiUsagePct: 36,
    activeTasks: 11,
    healthScore: 0.88
  },
  commandMessages: [
    {
      id: "msg-1",
      role: "assistant",
      content: "Command Center online. Ready for autonomous orchestration.",
      timestamp: nowIso(),
      reasoningSteps: ["Initialized context graph", "Loaded active goals", "Validated safety policies"],
      agentActivity: ["Planner synced", "Reasoner warmed", "Swarm standby"]
    }
  ],
  agents: [
    { id: "agent-1", role: "planner", status: "running", task: "decompose milestones", updatedAt: nowIso() },
    { id: "agent-2", role: "researcher", status: "running", task: "curiosity scan", updatedAt: nowIso() },
    { id: "agent-3", role: "executor", status: "idle", task: "waiting", updatedAt: nowIso() }
  ],
  discoveries: [
    {
      id: "disc-1",
      title: "Anomaly in API latency patterns",
      summary: "Curiosity engine detected periodic spikes aligned with batch embeddings.",
      confidence: 0.82,
      source: "curiosity_engine",
      timestamp: nowIso()
    }
  ],
  memoryRecords: [],
  workflows: [],
  logs: ["[boot] frontend shell initialized"],
  busEvents: [],
  settings: initialSettings,
  connections: {
    restHealthy: true,
    wsConnected: false,
    streamConnected: false
  },

  setSection: (section) => set({ section, sidebarOpen: false }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),

  setTheme: (theme) => {
    set((state) => ({ settings: { ...state.settings, theme } }));
    if (typeof window !== "undefined") {
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
  },

  setConnections: (value) => set((state) => ({ connections: { ...state.connections, ...value } })),

  appendBusEvent: (event) => {
    set((state) => {
      const nextEvents = [event, ...state.busEvents].slice(0, 180);
      const logs = [`[${event.severity}] ${event.topic} from ${event.source}`, ...state.logs].slice(0, 240);
      const nextMetrics = {
        ...state.metrics,
        activeTasks: Math.max(0, state.metrics.activeTasks + (event.topic.includes("task") ? 1 : 0)),
        computeUsagePct: Math.min(100, state.metrics.computeUsagePct + (event.severity === "warning" ? 1 : 0))
      };
      return { busEvents: nextEvents, logs, metrics: nextMetrics };
    });
  },

  sendCommand: async (text) => {
    const optimistic: CommandMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: nowIso()
    };
    set((state) => ({ commandMessages: [...state.commandMessages, optimistic] }));

    try {
      const result = await apiClient.sendCommand(text);
      set((state) => ({
        commandMessages: [...state.commandMessages, result],
        connections: { ...state.connections, restHealthy: true }
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      set((state) => ({
        commandMessages: [
          ...state.commandMessages,
          {
            id: `msg-${Date.now()}-err`,
            role: "assistant",
            content: `Command failed: ${message}`,
            timestamp: nowIso(),
            reasoningSteps: ["API gateway failure"],
            agentActivity: ["No dispatch"]
          }
        ],
        connections: { ...state.connections, restHealthy: false }
      }));
    }
  },

  loadMemory: async () => {
    try {
      const records = await apiClient.fetchMemory();
      set((state) => ({ memoryRecords: records, connections: { ...state.connections, restHealthy: true } }));
    } catch {
      set((state) => ({ connections: { ...state.connections, restHealthy: false } }));
    }
  },

  saveMemory: async (record) => {
    const updated = await apiClient.updateMemory(record);
    set((state) => ({
      memoryRecords: state.memoryRecords.map((item) => (item.id === updated.id ? updated : item))
    }));
  },

  loadWorkflows: async () => {
    try {
      const workflows = await apiClient.fetchWorkflows();
      set((state) => ({ workflows, connections: { ...state.connections, restHealthy: true } }));
    } catch {
      set((state) => ({ connections: { ...state.connections, restHealthy: false } }));
    }
  },

  toggleWorkflow: async (workflowId, enabled) => {
    await apiClient.toggleWorkflow(workflowId, enabled);
    set((state) => ({
      workflows: state.workflows.map((workflow) =>
        workflow.id === workflowId ? { ...workflow, enabled, lastRun: nowIso() } : workflow
      )
    }));
  }
}));

export const reconfigureApiGateway = (url: string) => {
  apiClient = new ApiGatewayClient(url);
};
