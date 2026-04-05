/**
 * Device Bridge - Phase 3 Advanced Features
 * Handles inter-device communication and cross-device task relay
 */

import { DeviceMessage, RemoteTask, Task } from '@/types';
import { getDeviceMesh } from '@/core/device-mesh';

const DEVICE_MESSAGE_LOG_KEY = 'paxion_device_messages';
const MAX_MESSAGE_LOG = 500;
const MESSAGE_TIMEOUT = 30000; // 30 second response timeout

export class DeviceBridge {
  private mesh = getDeviceMesh();
  private messageLog: DeviceMessage[] = [];
  private pendingMessages: Map<string, { resolve: any; reject: any; timeout: NodeJS.Timeout }> = new Map();
  private messageListeners: Set<(message: DeviceMessage) => void> = new Set();

  constructor() {
    this.loadMessageLog();
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

    // Create remote task wrapper
    const remoteTask: RemoteTask = {
      ...preparedTask,
      targetDeviceId,
      sourceDeviceId: localDevice.id,
      relayedAt: new Date(),
      responseReceived: false,
    };

    // Create message envelope
    const message: DeviceMessage = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      fromDeviceId: localDevice.id,
      toDeviceId: targetDeviceId,
      type: 'task',
      payload: {
        command: preparedTask.command,
        taskId: preparedTask.id,
      },
      timestamp: new Date(),
      priority: 'normal',
      confirmed: false,
    };

    this.messageLog.push(message);
    this.saveMessageLog();
    this.notifyListeners(message);

    // In a real implementation, send via WebSocket/WebRTC to target device
    console.log(
      `[DeviceBridge] Sending task ${preparedTask.id} to ${targetDevice.name}: "${preparedTask.command}"`
    );

    // For MVP: simulate local execution
    return this.simulateRemoteExecution(remoteTask, targetDevice.name);
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

    // In a real implementation, send via WebSocket/WebRTC
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
   * Simulate remote task execution (MVP implementation)
   * In production, this would connect to actual remote device
   */
  private async simulateRemoteExecution(
    task: RemoteTask,
    deviceName: string
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      // Register timeout
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(task.id);
        reject(new Error(`Task timeout on ${deviceName}`));
      }, MESSAGE_TIMEOUT);

      this.pendingMessages.set(task.id, { resolve, reject, timeout });

      // Simulate execution delay
      setTimeout(() => {
        const success = Math.random() > 0.1; // 90% success rate for simulation

        if (success) {
          resolve({
            success: true,
            message: `Task executed on ${deviceName}: ${task.command}`,
            timestamp: new Date(),
          });
          this.sendResponse(task.sourceDeviceId, task.id, {
            success: true,
            output: `Task completed: ${task.command}`,
          });
        } else {
          reject(new Error(`Task failed on ${deviceName}`));
          this.sendResponse(task.sourceDeviceId, task.id, null, 'Execution failed');
        }

        this.pendingMessages.delete(task.id);
      }, 500);
    });
  }

  /**
   * Clear message log
   */
  clearMessageLog(): void {
    this.messageLog = [];
    localStorage.removeItem(DEVICE_MESSAGE_LOG_KEY);
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
