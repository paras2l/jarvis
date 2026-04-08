/**
 * Device Bridge - Phase 3 Advanced Features
 * Handles inter-device communication and cross-device task relay
 */

import { DeviceMessage, Task } from '@/types';
import { getDeviceMesh } from '@/core/device-mesh';
import taskExecutor from '@/core/task-executor';
import { runtimeStatusStore } from '@/core/runtime-status';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

const DEVICE_MESSAGE_LOG_KEY = 'paxion_device_messages';
const DEVICE_QUEUE_KEY = 'paxion_device_outbox';
const MAX_MESSAGE_LOG = 500;
const MESSAGE_TIMEOUT = 30000; // 30 second response timeout

type QueuedEnvelope = {
  id: string
  encryptedPayload: string
  createdAt: number
  retries: number
}

export class DeviceBridge {
  private mesh = getDeviceMesh();
  private messageLog: DeviceMessage[] = [];
  private pendingMessages: Map<string, { resolve: any; reject: any; timeout: NodeJS.Timeout }> = new Map();
  private messageListeners: Set<(message: DeviceMessage) => void> = new Set();
  private transportChannel: RealtimeChannel | null = null;
  private transportReady = false;
  private transportTopic = 'device_mesh_transport';
  private taskExecutor: ((task: Task) => Promise<unknown>) | null = null;
  private outbox: QueuedEnvelope[] = [];
  private drainTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.loadMessageLog();
    this.loadOutbox();
    this.initializeTransport().catch((error) => {
      console.error('[DeviceBridge] Failed to initialize realtime transport:', error);
    });
    this.startOutboxDrainLoop();
  }

  private async initializeTransport(): Promise<void> {
    if (this.transportChannel) return;

    this.transportChannel = supabase
      .channel(this.transportTopic)
      .on('broadcast', { event: 'device-message' }, ({ payload }) => {
        this.handleTransportPayload(payload).catch((error) => {
          console.error('[DeviceBridge] Transport payload error:', error);
        });
      });

    await this.transportChannel.subscribe((status) => {
      this.transportReady = status === 'SUBSCRIBED';
      if (this.transportReady) {
        console.log('[DeviceBridge] Realtime transport online');
        this.announceLocalPresence().catch((error) => {
          console.error('[DeviceBridge] Presence announce failed:', error);
        });
        this.flushOutbox().catch(() => {});
      }
    });
  }

  private async announceLocalPresence(): Promise<void> {
    const local = this.mesh.getLocalDevice();

    const handshake: DeviceMessage = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      fromDeviceId: local.id,
      toDeviceId: '*',
      type: 'status-query',
      payload: {
        status: 'capability_handshake',
      },
      timestamp: new Date(),
      priority: 'normal',
      confirmed: false,
    };

    this.messageLog.push(handshake);
    this.saveMessageLog();
    this.notifyListeners(handshake);
    await this.publishMessage(handshake);
  }

  private async publishMessage(message: DeviceMessage): Promise<boolean> {
    await this.initializeTransport();
    if (!this.transportChannel || !this.transportReady) {
      await this.enqueueMessage(message);
      return false;
    }

    const encryptedPayload = await this.encryptPayload({
      ...message,
      timestamp: message.timestamp.toISOString(),
    });

    const result = await this.transportChannel.send({
      type: 'broadcast',
      event: 'device-message',
      payload: {
        id: message.id,
        encryptedPayload,
      },
    });

    if (result !== 'ok') {
      await this.enqueueMessage(message);
    }

    return result === 'ok';
  }

  private async handleTransportPayload(payload: unknown): Promise<void> {
    if (!payload || typeof payload !== 'object') return;
    const raw = payload as Record<string, unknown>;
    const decrypted = await this.decryptIncomingPayload(raw);
    if (!decrypted) return;

    const localDevice = this.mesh.getLocalDevice();

    const incoming: DeviceMessage = {
      id: String(decrypted.id || ''),
      fromDeviceId: String(decrypted.fromDeviceId || ''),
      toDeviceId: String(decrypted.toDeviceId || ''),
      type: (decrypted.type as DeviceMessage['type']) || 'status-query',
      payload: (decrypted.payload as DeviceMessage['payload']) || {},
      timestamp: new Date(String(decrypted.timestamp || Date.now())),
      priority: (decrypted.priority as DeviceMessage['priority']) || 'normal',
      confirmed: Boolean(decrypted.confirmed),
    };

    const isBroadcast = incoming.toDeviceId === '*';
    if (!incoming.toDeviceId || (!isBroadcast && incoming.toDeviceId !== localDevice.id)) {
      return;
    }

    if (incoming.fromDeviceId === localDevice.id) {
      return;
    }

    this.messageLog.push(incoming);
    this.saveMessageLog();
    this.notifyListeners(incoming);

    if (incoming.type === 'response') {
      const responseTaskId = String(incoming.payload.taskId || '');

      if (responseTaskId === 'capability_handshake') {
        const profile = incoming.payload.result as {
          id?: string
          name?: string
          type?: 'desktop' | 'mobile' | 'tablet' | 'wearable' | 'smart-home'
          platform?: 'windows' | 'macos' | 'linux' | 'android' | 'ios'
          status?: 'online' | 'offline' | 'sleep'
          capabilities?: string[]
        } | undefined;

        if (profile?.id && profile.name && profile.platform && profile.type && profile.status) {
          this.mesh.upsertRemotePresence({
            id: profile.id,
            name: profile.name,
            type: profile.type,
            platform: profile.platform,
            status: profile.status,
            capabilities: Array.isArray(profile.capabilities) ? profile.capabilities : [],
          });
        }
        return;
      }

      if (!responseTaskId || !this.pendingMessages.has(responseTaskId)) return;

      const pending = this.pendingMessages.get(responseTaskId)!;
      clearTimeout(pending.timeout);
      if (incoming.payload.error) {
        pending.reject(new Error(String(incoming.payload.error)));
      } else {
        pending.resolve(incoming.payload.result);
      }
      this.pendingMessages.delete(responseTaskId);
      return;
    }

    if (incoming.type === 'status-query' && incoming.payload.status === 'capability_handshake') {
      const local = this.mesh.getLocalDevice();
      await this.sendResponse(incoming.fromDeviceId, 'capability_handshake', {
        id: local.id,
        name: local.name,
        type: local.type,
        platform: local.platform,
        status: local.status,
        capabilities: local.capabilities,
      });
      return;
    }

    if (incoming.type === 'task') {
      const taskId = String(incoming.payload.taskId || '');
      const command = String(incoming.payload.command || '');
      const taskType = String((incoming.payload as any).taskType || 'custom') as Task['type'];

      if (!taskId || !command) {
        await this.sendResponse(incoming.fromDeviceId, taskId || 'unknown-task', null, 'Malformed remote task payload');
        return;
      }

      try {
        const task: Task = {
          id: taskId,
          command,
          type: taskType,
          status: 'pending',
          createdAt: new Date(),
        };

        const execute = this.taskExecutor || (await this.getDefaultTaskExecutor());
        if (!execute) {
          await this.sendResponse(incoming.fromDeviceId, taskId, null, 'No task executor registered on target device');
          return;
        }

        const result = await execute(task);
        await this.sendResponse(incoming.fromDeviceId, taskId, result);
      } catch (error) {
        await this.sendResponse(
          incoming.fromDeviceId,
          taskId,
          null,
          error instanceof Error ? error.message : 'Remote execution failed'
        );
      }
    }
  }

  private async getDefaultTaskExecutor(): Promise<((task: Task) => Promise<unknown>) | null> {
    return async (task: Task) => {
      const localDevice = this.mesh.getLocalDevice();
      return taskExecutor.executeTask(task, {
        userId: 'remote-user',
        agentId: 'remote-agent',
        taskId: task.id,
        device: localDevice.type === 'mobile' ? 'mobile' : 'desktop',
        platform: localDevice.platform,
      });
    };
  }

  registerTaskExecutor(executor: (task: Task) => Promise<unknown>): void {
    this.taskExecutor = executor;
  }

  /**
   * Load message history from localStorage
   */
  private loadMessageLog(): void {
    try {
      const stored = localStorage.getItem(DEVICE_MESSAGE_LOG_KEY);
      if (stored) {
        this.messageLog = JSON.parse(stored).map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
      }
    } catch (error) {
      console.error('[DeviceBridge] Failed to load message log:', error);
    }
  }

  /**
   * Save message history to localStorage
   */
  private saveMessageLog(): void {
    try {
      // Keep only last MAX_MESSAGE_LOG messages
      const recentMessages = this.messageLog.slice(-MAX_MESSAGE_LOG);
      localStorage.setItem(DEVICE_MESSAGE_LOG_KEY, JSON.stringify(recentMessages));
    } catch (error) {
      console.error('[DeviceBridge] Failed to save message log:', error);
    }
  }

  /**
   * Send a task to a remote device
   */
  async sendRemoteTask(
    targetDeviceId: string,
    task: Task
  ): Promise<unknown> {
    const localDevice = this.mesh.getLocalDevice();
    const targetDevice = this.mesh.getDevice(targetDeviceId);

    if (!targetDevice) {
      throw new Error(`Target device ${targetDeviceId} not found`);
    }

    // Check permissions
    if (!this.mesh.canControl(localDevice.id, targetDeviceId, task.type)) {
      throw new Error(
        `Permission denied: cannot perform ${task.type} on ${targetDevice.name}`
      );
    }

    // Try to wake the device if sleeping
    if (targetDevice.status === 'sleep') {
      console.log(`[DeviceBridge] Target device is sleeping, attempting wake...`);
      const woken = await this.mesh.wakeDevice(targetDeviceId);
      if (!woken) {
        throw new Error(`Failed to wake device ${targetDevice.name}`);
      }
    }

    const preparedTask = await this.enrichTaskForTargetDevice(task, targetDevice.platform);

    // Create message envelope
    const message: DeviceMessage = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      fromDeviceId: localDevice.id,
      toDeviceId: targetDeviceId,
      type: 'task',
      payload: {
        command: preparedTask.command,
        taskId: preparedTask.id,
        ...( { taskType: preparedTask.type } as Record<string, unknown> ),
      },
      timestamp: new Date(),
      priority: 'normal',
      confirmed: false,
    };

    this.messageLog.push(message);
    this.saveMessageLog();
    this.notifyListeners(message);

    const delivered = await this.publishMessage(message);
    if (!delivered) {
      throw new Error('Realtime transport unavailable. Check Supabase connection on both devices.');
    }

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(preparedTask.id);
        reject(new Error(`Task timeout on ${targetDevice.name}`));
      }, MESSAGE_TIMEOUT);

      this.pendingMessages.set(preparedTask.id, { resolve, reject, timeout });
      console.log(`[DeviceBridge] Task ${preparedTask.id} sent to ${targetDevice.name} via realtime transport`);
    });
  }

  private async enrichTaskForTargetDevice(
    task: Task,
    platform: 'windows' | 'macos' | 'linux' | 'android' | 'ios'
  ): Promise<Task> {
    try {
      const parsed = JSON.parse(task.command) as Record<string, unknown>;
      const action = String(parsed.action || '').trim().toLowerCase();
      const appName = String(parsed.app || '').trim();

      if (action !== 'launch_app' || !appName) {
        return task;
      }

      const installedApps = await this.getInstalledAppsSnapshot(platform);
      if (!installedApps.length) {
        return task;
      }

      const enrichedCommand = {
        ...parsed,
        targetPlatform: platform,
        installedAppsSnapshot: installedApps,
      };

      return {
        ...task,
        command: JSON.stringify(enrichedCommand),
      };
    } catch {
      return task;
    }
  }

  private async getInstalledAppsSnapshot(
    platform: 'windows' | 'macos' | 'linux' | 'android' | 'ios'
  ): Promise<Array<Record<string, unknown>>> {
    if (typeof window === 'undefined' || !window.nativeBridge?.getInstalledAppsMetadata) {
      return [];
    }

    const result = await window.nativeBridge.getInstalledAppsMetadata(platform);
    if (!result.success || !Array.isArray(result.apps)) {
      return [];
    }

    return result.apps as Array<Record<string, unknown>>;
  }

  /**
   * Send a response back to source device
   */
  async sendResponse(
    targetDeviceId: string,
    taskId: string,
    result: unknown,
    error?: string
  ): Promise<void> {
    const localDevice = this.mesh.getLocalDevice();

    const message: DeviceMessage = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      fromDeviceId: localDevice.id,
      toDeviceId: targetDeviceId,
      type: 'response',
      payload: {
        taskId,
        result,
        error,
      },
      timestamp: new Date(),
      priority: 'high',
      confirmed: false,
    };

    this.messageLog.push(message);
    this.saveMessageLog();
    this.notifyListeners(message);

    await this.publishMessage(message);
    console.log(`[DeviceBridge] Sending response for task ${taskId}`);

    // Resolve any pending promises
    if (this.pendingMessages.has(taskId)) {
      const pending = this.pendingMessages.get(taskId)!;
      clearTimeout(pending.timeout);
      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(result);
      }
      this.pendingMessages.delete(taskId);
    }
  }

  /**
   * Request device to wake up
   */
  async requestWakeup(targetDeviceId: string): Promise<boolean> {
    const targetDevice = this.mesh.getDevice(targetDeviceId);
    if (!targetDevice) {
      throw new Error(`Device ${targetDeviceId} not found`);
    }

    const message: DeviceMessage = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      fromDeviceId: this.mesh.getLocalDevice().id,
      toDeviceId: targetDeviceId,
      type: 'wake-request',
      payload: {},
      timestamp: new Date(),
      priority: 'high',
      confirmed: false,
    };

    console.log(`[DeviceBridge] Requesting wakeup for ${targetDevice.name}`);
    this.messageLog.push(message);
    this.saveMessageLog();
    this.notifyListeners(message);

    // Simulate wake success
    return true;
  }

  /**
   * Query device status
   */
  async queryDeviceStatus(targetDeviceId: string): Promise<string> {
    const targetDevice = this.mesh.getDevice(targetDeviceId);
    if (!targetDevice) {
      throw new Error(`Device ${targetDeviceId} not found`);
    }

    const message: DeviceMessage = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      fromDeviceId: this.mesh.getLocalDevice().id,
      toDeviceId: targetDeviceId,
      type: 'status-query',
      payload: {},
      timestamp: new Date(),
      priority: 'normal',
      confirmed: false,
    };

    this.messageLog.push(message);
    this.saveMessageLog();
    this.notifyListeners(message);

    // Return current known status
    return targetDevice.status;
  }

  /**
   * Get message history for a device pair
   */
  getMessageHistory(
    deviceId1?: string,
    deviceId2?: string
  ): DeviceMessage[] {
    if (!deviceId1 && !deviceId2) {
      return this.messageLog;
    }

    return this.messageLog.filter(msg => {
      if (deviceId1 && deviceId2) {
        return (
          (msg.fromDeviceId === deviceId1 && msg.toDeviceId === deviceId2) ||
          (msg.fromDeviceId === deviceId2 && msg.toDeviceId === deviceId1)
        );
      }
      return msg.fromDeviceId === deviceId1 || msg.toDeviceId === deviceId1;
    });
  }

  /**
   * Subscribe to incoming messages
   */
  onMessage(listener: (message: DeviceMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  /**
   * Notify all listeners of new message
   */
  private notifyListeners(message: DeviceMessage): void {
    this.messageListeners.forEach(listener => listener(message));
  }

  /**
   * Clear message log
   */
  clearMessageLog(): void {
    this.messageLog = [];
    localStorage.removeItem(DEVICE_MESSAGE_LOG_KEY);
  }

  private loadOutbox(): void {
    try {
      const raw = localStorage.getItem(DEVICE_QUEUE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as QueuedEnvelope[];
      this.outbox = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.outbox = [];
    }
  }

  private saveOutbox(): void {
    localStorage.setItem(DEVICE_QUEUE_KEY, JSON.stringify(this.outbox.slice(-500)));
    runtimeStatusStore.setQueuedMessages(this.outbox.length);
  }

  private startOutboxDrainLoop(): void {
    if (this.drainTimer) return;
    this.drainTimer = setInterval(() => {
      void this.flushOutbox();
    }, 5000);
  }

  private async flushOutbox(): Promise<void> {
    if (!this.transportChannel || !this.transportReady || !this.outbox.length) return;

    const copy = [...this.outbox];
    for (const queued of copy) {
      const result = await this.transportChannel.send({
        type: 'broadcast',
        event: 'device-message',
        payload: {
          id: queued.id,
          encryptedPayload: queued.encryptedPayload,
        },
      });

      if (result === 'ok') {
        this.outbox = this.outbox.filter((item) => item.id !== queued.id);
      } else {
        const current = this.outbox.find((item) => item.id === queued.id);
        if (current) current.retries += 1;
      }
    }

    this.saveOutbox();
  }

  private async enqueueMessage(message: DeviceMessage): Promise<void> {
    const encryptedPayload = await this.encryptPayload({
      ...message,
      timestamp: message.timestamp.toISOString(),
    });

    this.outbox.push({
      id: message.id,
      encryptedPayload,
      createdAt: Date.now(),
      retries: 0,
    });
    this.saveOutbox();
  }

  private getTransportSecret(): string {
    const key = 'paxion_device_transport_secret';
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const generated = `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(key, generated);
    return generated;
  }

  private async encryptPayload(payload: Record<string, unknown>): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const secret = this.getTransportSecret();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret.padEnd(32, '_').slice(0, 32)),
        { name: 'AES-GCM' },
        false,
        ['encrypt'],
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = encoder.encode(JSON.stringify(payload));
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyMaterial, data);
      const binary = new Uint8Array(encrypted);
      const packed = new Uint8Array(iv.length + binary.length);
      packed.set(iv, 0);
      packed.set(binary, iv.length);
      return btoa(String.fromCharCode(...packed));
    } catch {
      return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    }
  }

  private async decryptIncomingPayload(raw: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    if (raw.encryptedPayload && typeof raw.encryptedPayload === 'string') {
      try {
        const bytes = Uint8Array.from(atob(raw.encryptedPayload), (c) => c.charCodeAt(0));
        const iv = bytes.slice(0, 12);
        const data = bytes.slice(12);
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          encoder.encode(this.getTransportSecret().padEnd(32, '_').slice(0, 32)),
          { name: 'AES-GCM' },
          false,
          ['decrypt'],
        );
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, keyMaterial, data);
        const text = new TextDecoder().decode(decrypted);
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        try {
          const legacy = decodeURIComponent(escape(atob(raw.encryptedPayload)));
          return JSON.parse(legacy) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }

    return raw;
  }
}

// Singleton instance
let bridgeInstance: DeviceBridge | null = null;

export function getDeviceBridge(): DeviceBridge {
  if (!bridgeInstance) {
    bridgeInstance = new DeviceBridge();
  }
  return bridgeInstance;
}
