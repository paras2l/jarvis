/**
 * Device Mesh - Phase 3 Advanced Features
 * Manages device discovery, registration, and local network mesh
 */

import { Device, DevicePermission, Task } from '@/types';

const DEVICE_REGISTRY_KEY = 'paxion_device_registry';
const LOCAL_DEVICE_ID_KEY = 'paxion_local_device_id';
const DEVICE_MESH_HEARTBEAT_INTERVAL = 30000; // 30 seconds
const DEVICE_DISCOVERY_TIMEOUT = 5000; // 5 second scan

export class DeviceMesh {
  private localDeviceId: string;
  private localDeviceName: string;
  private registeredDevices: Map<string, Device> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private discoveryListeners: Set<(devices: Device[]) => void> = new Set();

  constructor(localDeviceName: string = 'Personal AI Hub') {
    this.localDeviceId = this.generateDeviceId();
    this.localDeviceName = localDeviceName;
    this.loadDeviceRegistry();
  }

  /**
   * Generate unique device ID (UUID-like)
   */
  private generateDeviceId(): string {
    const stored = localStorage.getItem(LOCAL_DEVICE_ID_KEY);
    if (stored) return stored;

    const created = 'device_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    localStorage.setItem(LOCAL_DEVICE_ID_KEY, created);
    return created;
  }

  /**
   * Load previously discovered devices from localStorage
   */
  private loadDeviceRegistry(): void {
    try {
      const stored = localStorage.getItem(DEVICE_REGISTRY_KEY);
      if (stored) {
        const devices = JSON.parse(stored);
        devices.forEach((device: Device) => {
          // Re-hydrate Date objects
          device.lastSeen = new Date(device.lastSeen);
          device.registeredAt = new Date(device.registeredAt);
          if (device.permissions) {
            device.permissions.forEach(p => {
              if (p.approvedAt) p.approvedAt = new Date(p.approvedAt);
            });
          }
          this.registeredDevices.set(device.id, device);
        });
      }
    } catch (error) {
      console.error('[DeviceMesh] Failed to load device registry:', error);
    }
  }

  /**
   * Persist devices to localStorage
   */
  private saveDeviceRegistry(): void {
    try {
      const devices = Array.from(this.registeredDevices.values());
      localStorage.setItem(DEVICE_REGISTRY_KEY, JSON.stringify(devices));
    } catch (error) {
      console.error('[DeviceMesh] Failed to save device registry:', error);
    }
  }

  /**
   * Get local device info
   */
  getLocalDevice(): Device {
    const platform = this.detectPlatform();
    const type = platform === 'android' || platform === 'ios' ? 'mobile' : 'desktop';
    return {
      id: this.localDeviceId,
      name: this.localDeviceName,
      type,
      platform,
      status: 'online',
      capabilities: this.getDefaultCapabilities(platform, type),
      lastSeen: new Date(),
      permissions: [],
      registeredAt: new Date(),
    };
  }

  private getDefaultCapabilities(
    platform: 'windows' | 'macos' | 'linux' | 'android' | 'ios',
    type: Device['type']
  ): string[] {
    const common = [
      'open-apps',
      'send-messages',
      'voice-control',
      'chat',
      'file-basic',
    ];

    if (type === 'mobile') {
      return [
        ...common,
        'wake-via-push',
        'mobile-deeplink-launch',
        'call',
      ];
    }

    if (platform === 'windows' || platform === 'macos' || platform === 'linux') {
      return [
        ...common,
        'wake-via-http-request',
        'screen-control',
        'ocr',
        'browser-automation',
        'shell-command',
        'system-control',
        'media-control',
      ];
    }

    return common;
  }

  /**
   * Detect platform based on user agent
   */
  private detectPlatform(): 'windows' | 'macos' | 'linux' | 'android' | 'ios' {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.indexOf('win') > -1) return 'windows';
    if (ua.indexOf('mac') > -1) return 'macos';
    if (ua.indexOf('linux') > -1) return 'linux';
    if (ua.indexOf('android') > -1) return 'android';
    if (ua.indexOf('iphone') > -1 || ua.indexOf('ipad') > -1) return 'ios';
    return 'windows';
  }

  /**
   * Register a new device on the mesh
   */
  registerDevice(device: Device): void {
    const existing = this.registeredDevices.get(device.id);
    const merged: Device = {
      ...(existing || {} as Device),
      ...device,
      capabilities: Array.from(new Set([...(existing?.capabilities || []), ...(device.capabilities || [])])),
      permissions: device.permissions || existing?.permissions || [],
      lastSeen: device.lastSeen || new Date(),
      registeredAt: existing?.registeredAt || device.registeredAt || new Date(),
    };

    this.registeredDevices.set(device.id, merged);
    this.saveDeviceRegistry();
    this.notifyListeners();
  }

  upsertRemotePresence(profile: {
    id: string
    name: string
    type: Device['type']
    platform: Device['platform']
    status: Device['status']
    capabilities: string[]
  }): void {
    const current = this.registeredDevices.get(profile.id);
    this.registerDevice({
      id: profile.id,
      name: profile.name,
      type: profile.type,
      platform: profile.platform,
      status: profile.status,
      capabilities: profile.capabilities,
      lastSeen: new Date(),
      permissions: current?.permissions || [],
      registeredAt: current?.registeredAt || new Date(),
      networkAddress: current?.networkAddress,
      location: current?.location,
    });
  }

  supportsTaskOnDevice(deviceId: string, task: Task): boolean {
    const device = this.registeredDevices.get(deviceId);
    if (!device || device.status === 'offline') return false;

    const caps = new Set(device.capabilities || []);
    const parsed = this.safeParseCommand(task.command);
    const action = String(parsed.action || '').toLowerCase();

    if (task.type === 'app_launch') {
      return caps.has('open-apps') || caps.has('mobile-deeplink-launch');
    }

    if (task.type === 'message_send' || task.type === 'call') {
      return caps.has('send-messages') || caps.has('call');
    }

    if (task.type === 'screen_control') {
      return caps.has('screen-control') || caps.has('browser-automation');
    }

    if (action.includes('snapshot') || action.includes('ocr') || action.includes('ref_')) {
      return caps.has('ocr') || caps.has('screen-control') || caps.has('browser-automation');
    }

    if (action.includes('system_control')) {
      return caps.has('system-control');
    }

    if (action.includes('media_control')) {
      return caps.has('media-control');
    }

    if (action.includes('file_operation')) {
      return caps.has('file-basic') || caps.has('shell-command');
    }

    return caps.has('chat') || caps.has('open-apps');
  }

  findBestDeviceForTask(task: Task, options?: { excludeDeviceIds?: string[] }): Device | null {
    const excluded = new Set(options?.excludeDeviceIds || []);

    const candidates = this.getAllDevices()
      .filter((device) => !excluded.has(device.id) && device.status === 'online')
      .filter((device) => this.supportsTaskOnDevice(device.id, task));

    if (!candidates.length) return null;

    const score = (device: Device): number => {
      let s = 0;
      const caps = new Set(device.capabilities || []);
      if (caps.has('screen-control')) s += 4;
      if (caps.has('ocr')) s += 3;
      if (caps.has('browser-automation')) s += 2;
      if (caps.has('shell-command')) s += 2;
      if (device.type === 'desktop') s += 2;
      return s;
    };

    candidates.sort((a, b) => score(b) - score(a));
    return candidates[0] || null;
  }

  private safeParseCommand(command: string): Record<string, unknown> {
    try {
      return JSON.parse(command) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /**
   * Discover devices on local network (simulated via broadcast)
   */
  async discoverDevices(): Promise<Device[]> {
    return new Promise((resolve) => {
      // In a real implementation, this would:
      // 1. Broadcast discovery request via WebRTC/WebSocket
      // 2. Listen for responses from nearby devices
      // 3. Check network services (Bonjour/mDNS)
      // 4. Scan Bluetooth peripherals
      
      // For MVP, simulate discovery of registered devices
      setTimeout(() => {
        const onlineDevices = Array.from(this.registeredDevices.values()).filter(
          d => d.status !== 'offline'
        );
        resolve(onlineDevices);
      }, DEVICE_DISCOVERY_TIMEOUT);
    });
  }

  /**
   * Get all registered devices
   */
  getAllDevices(): Device[] {
    return Array.from(this.registeredDevices.values());
  }

  /**
   * Get a specific device by ID
   */
  getDevice(deviceId: string): Device | undefined {
    return this.registeredDevices.get(deviceId);
  }

  /**
   * Update device status
   */
  updateDeviceStatus(
    deviceId: string,
    status: 'online' | 'offline' | 'sleep'
  ): void {
    const device = this.registeredDevices.get(deviceId);
    if (device) {
      device.status = status;
      device.lastSeen = new Date();
      this.saveDeviceRegistry();
      this.notifyListeners();
    }
  }

  /**
   * Try to wake a sleeping device
   */
  async wakeDevice(deviceId: string): Promise<boolean> {
    const device = this.registeredDevices.get(deviceId);
    if (!device) {
      console.warn(`[DeviceMesh] Device ${deviceId} not found`);
      return false;
    }

    if (device.status !== 'sleep') {
      console.info(`[DeviceMesh] Device ${deviceId} is already ${device.status}`);
      return true;
    }

    // Attempt wake via available protocols (will be implemented in device-wakeup.ts)
    console.log(`[DeviceMesh] Attempting to wake ${device.name}...`);
    
    // Simulate wake attempt
    device.status = 'online';
    device.lastSeen = new Date();
    this.saveDeviceRegistry();
    this.notifyListeners();
    
    return true;
  }

  /**
   * Check if source device has permission to control target device
   */
  canControl(sourceDeviceId: string, targetDeviceId: string, action: string): boolean {
    const targetDevice = this.registeredDevices.get(targetDeviceId);
    if (!targetDevice) return false;

    const permission = targetDevice.permissions.find(
      p => p.sourceDeviceId === sourceDeviceId && p.approved
    );

    if (!permission) return false;
    return permission.actions.includes(action);
  }

  /**
   * Request permission to control device
   */
  requestPermission(
    sourceDeviceId: string,
    targetDeviceId: string,
    actions: string[]
  ): DevicePermission {
    const permission: DevicePermission = {
      id: 'perm_' + Math.random().toString(36).substr(2, 9),
      sourceDeviceId,
      targetDeviceId,
      actions,
      approved: false,
    };

    const device = this.registeredDevices.get(targetDeviceId);
    if (device) {
      device.permissions.push(permission);
      this.saveDeviceRegistry();
    }

    return permission;
  }

  /**
   * Approve a permission request
   */
  approvePermission(permissionId: string, targetDeviceId: string): boolean {
    const device = this.registeredDevices.get(targetDeviceId);
    if (!device) return false;

    const permission = device.permissions.find(p => p.id === permissionId);
    if (!permission) return false;

    permission.approved = true;
    permission.approvedAt = new Date();
    this.saveDeviceRegistry();

    return true;
  }

  /**
   * Revoke permission
   */
  revokePermission(permissionId: string, targetDeviceId: string): boolean {
    const device = this.registeredDevices.get(targetDeviceId);
    if (!device) return false;

    const index = device.permissions.findIndex(p => p.id === permissionId);
    if (index === -1) return false;

    device.permissions.splice(index, 1);
    this.saveDeviceRegistry();

    return true;
  }

  /**
   * Start heartbeat to maintain device presence
   */
  startHeartbeat(): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      const localDevice = this.getLocalDevice();
      this.registerDevice(localDevice);
      
      // Broadcast heartbeat to mesh (would connect to actual WebSocket/WebRTC)
      console.log(`[DeviceMesh] Heartbeat sent from ${this.localDeviceName}`);
    }, DEVICE_MESH_HEARTBEAT_INTERVAL);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Subscribe to device discovery updates
   */
  onDevicesDiscovered(listener: (devices: Device[]) => void): () => void {
    this.discoveryListeners.add(listener);
    return () => this.discoveryListeners.delete(listener);
  }

  /**
   * Notify all listeners of device changes
   */
  private notifyListeners(): void {
    const devices = this.getAllDevices();
    this.discoveryListeners.forEach(listener => listener(devices));
  }

  /**
   * Clear all devices (for reset/testing)
   */
  clearRegistry(): void {
    this.registeredDevices.clear();
    localStorage.removeItem(DEVICE_REGISTRY_KEY);
    this.notifyListeners();
  }
}

// Singleton instance
let meshInstance: DeviceMesh | null = null;

export function getDeviceMesh(deviceName?: string): DeviceMesh {
  if (!meshInstance) {
    meshInstance = new DeviceMesh(deviceName);
  }
  return meshInstance;
}
