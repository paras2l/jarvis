export type ProtocolStatus = 'offline' | 'connecting' | 'online' | 'error';

export interface ProtocolAction {
  id: string;
  label: string;
  description: string;
  sensitive: boolean;
  category?: string;
}

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
  auditId?: string;
}

export interface BaseProtocol {
  id: string;
  name: string;
  description: string;
  status: ProtocolStatus;
  actions: ProtocolAction[];
  
  initialize(): Promise<void>;
  execute(actionId: string, params: Record<string, any>): Promise<ActionResult>;
}
