import { BaseProtocol, ActionResult } from './types';

export class ProtocolRegistry {
  private static instance: ProtocolRegistry;
  private protocols: Map<string, BaseProtocol> = new Map();

  private constructor() {}

  public static getInstance(): ProtocolRegistry {
    if (!ProtocolRegistry.instance) {
      ProtocolRegistry.instance = new ProtocolRegistry();
    }
    return ProtocolRegistry.instance;
  }

  public register(protocol: BaseProtocol): void {
    if (this.protocols.has(protocol.id)) {
      console.warn(`[PROTOCOL_REGISTRY] Protocol with id ${protocol.id} already exists. Overwriting.`);
    }
    this.protocols.set(protocol.id, protocol);
  }

  public getProtocol(id: string): BaseProtocol | undefined {
    return this.protocols.get(id);
  }

  public async initializeAll(): Promise<void> {
    const initPromises = Array.from(this.protocols.values()).map(async (p) => {
      try {
        await p.initialize();
      } catch (err) {
        console.error(`[PROTOCOL_REGISTRY] Failed to initialize ${p.id}:`, err);
      }
    });
    await Promise.all(initPromises);
  }

  public async executeAction(
    protocolId: string, 
    actionId: string, 
    params: Record<string, any>
  ): Promise<ActionResult> {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) {
      return { success: false, error: `Protocol ${protocolId} not found.` };
    }
    
    try {
      return await protocol.execute(actionId, params);
    } catch (err: any) {
      console.error(`[PROTOCOL_REGISTRY] Execution error in ${protocolId}.${actionId}:`, err);
      return { success: false, error: err.message || 'Internal execution error.' };
    }
  }

  public getAllProtocols(): BaseProtocol[] {
    return Array.from(this.protocols.values());
  }
}

export const protocolRegistry = ProtocolRegistry.getInstance();
