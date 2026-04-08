import { BusEvent, CommandMessage, MemoryRecord, WorkflowItem } from "@/lib/types";

export class ApiGatewayClient {
  constructor(private readonly baseUrl: string) {}

  async sendCommand(text: string): Promise<CommandMessage> {
    const response = await fetch(`${this.baseUrl}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error(`Command request failed: ${response.status}`);
    }

    return (await response.json()) as CommandMessage;
  }

  async fetchMemory(): Promise<MemoryRecord[]> {
    const response = await fetch(`${this.baseUrl}/memory`);
    if (!response.ok) {
      throw new Error(`Memory fetch failed: ${response.status}`);
    }
    return (await response.json()) as MemoryRecord[];
  }

  async updateMemory(record: MemoryRecord): Promise<MemoryRecord> {
    const response = await fetch(`${this.baseUrl}/memory/${record.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    });

    if (!response.ok) {
      throw new Error(`Memory update failed: ${response.status}`);
    }
    return (await response.json()) as MemoryRecord;
  }

  async fetchWorkflows(): Promise<WorkflowItem[]> {
    const response = await fetch(`${this.baseUrl}/automation/workflows`);
    if (!response.ok) {
      throw new Error(`Workflow fetch failed: ${response.status}`);
    }
    return (await response.json()) as WorkflowItem[];
  }

  async toggleWorkflow(workflowId: string, enabled: boolean): Promise<void> {
    const response = await fetch(`${this.baseUrl}/automation/workflows/${workflowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled })
    });

    if (!response.ok) {
      throw new Error(`Workflow toggle failed: ${response.status}`);
    }
  }

  async fetchBusEvents(limit = 80): Promise<BusEvent[]> {
    const response = await fetch(`${this.baseUrl}/system-bus/events?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`Bus event fetch failed: ${response.status}`);
    }
    return (await response.json()) as BusEvent[];
  }
}
