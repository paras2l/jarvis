import { db } from './db';

export const auditLedger = {
  async append(eventType: string, data: { pluginId: string, actionId: string, params: any }) {
    console.log(`[AUDIT] ${eventType}: ${data.pluginId}.${data.actionId}`);
    return await db.audit.append({
      event_type: eventType,
      plugin_id: data.pluginId,
      action_id: data.actionId,
      params: data.params
    });
  },

  async getLegacy() {
    return await db.audit.getRecent();
  }
};

export const IMMUTABLE_BOUNDARY_PREFIXES = [
  'RAIZEN_INTERNAL:',
  'SOVEREIGN_CORE:',
  'PATRIARCH_IDENTITY:'
];
