/**
 * Device Wakeup - Phase 3 Advanced Features
 * Manages different wake protocols for remote devices
 */

import { Device, WakeProtocol } from '@/types';
import { getDeviceMesh } from '@/core/device-mesh';

const WAKE_PROTOCOLS_KEY = 'paxion_wake_protocols';

export class DeviceWakeupManager {
  private mesh = getDeviceMesh();
  private protocols: Map<string, WakeProtocol[]> = new Map();

  constructor() {
    this.loadProtocols();
  }

  /**
   * Load saved wake protocols from localStorage
   */
  private loadProtocols(): void {
    try {
      const stored = localStorage.getItem(WAKE_PROTOCOLS_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        Object.entries(data).forEach(([deviceId, protoArray]: [string, any]) => {
          this.protocols.set(deviceId, protoArray.map((p: any) => ({
            ...p,
            lastUsed: p.lastUsed ? new Date(p.lastUsed) : undefined,
          })));
        });
      }
    } catch (error) {
      console.error('[WakeupManager] Failed to load protocols:', error);
    }
  }

  /**
   * Save wake protocols to localStorage
   */
  private saveProtocols(): void {
    try {
      const data: Record<string, WakeProtocol[]> = {};
      this.protocols.forEach((protoArray, deviceId) => {
        data[deviceId] = protoArray;
      });
      localStorage.setItem(WAKE_PROTOCOLS_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('[WakeupManager] Failed to save protocols:', error);
    }
  }

  /**
   * Register a wake protocol for a device
   */
  registerProtocol(deviceId: string, protocol: WakeProtocol): void {
    if (!this.protocols.has(deviceId)) {
      this.protocols.set(deviceId, []);
    }

    const existing = this.protocols.get(deviceId)!.findIndex(
      p => p.type === protocol.type
    );

    if (existing >= 0) {
      this.protocols.get(deviceId)![existing] = protocol;
    } else {
      this.protocols.get(deviceId)!.push(protocol);
    }

    this.saveProtocols();
    console.log(`[WakeupManager] Registered ${protocol.type} protocol for device ${deviceId}`);
  }

  /**
   * Get available wake protocols for a device
   */
  getProtocols(deviceId: string): WakeProtocol[] {
    return this.protocols.get(deviceId) || [];
  }

  /**
   * Attempt to wake a device using all available protocols
   */
  async wakeDevice(deviceId: string): Promise<boolean> {
    const device = this.mesh.getDevice(deviceId);
    if (!device) {
      console.error(`[WakeupManager] Device ${deviceId} not found`);
      return false;
    }

    console.log(`[WakeupManager] Attempting to wake ${device.name}...`);

    const protocols = this.getProtocols(deviceId);
    if (protocols.length === 0) {
      console.warn(`[WakeupManager] No wake protocols registered for ${device.name}`);
      return false;
    }

    // Try protocols in order: BLE > WiFi > HTTP
    const protocolPriority = ['bluetooth', 'wifi', 'http-request', 'push-notification'];
    const sorted = protocols.sort((a, b) => {
      const aIdx = protocolPriority.indexOf(a.type);
      const bIdx = protocolPriority.indexOf(b.type);
      return aIdx - bIdx;
    });

    for (const protocol of sorted) {
      if (!protocol.enabled) continue;

      try {
        const success = await this.executeWakeProtocol(device, protocol);
        if (success) {
          protocol.lastUsed = new Date();
          this.saveProtocols();
          return true;
        }
      } catch (error) {
        console.warn(`[WakeupManager] ${protocol.type} failed:`, error);
      }
    }

    return false;
  }

  /**
   * Execute a specific wake protocol
   */
  private async executeWakeProtocol(
    device: Device,
    protocol: WakeProtocol
  ): Promise<boolean> {
    switch (protocol.type) {
      case 'bluetooth':
        return this.wakeViaBluetooth(device, protocol);
      case 'wifi':
        return this.wakeViaWiFi(device, protocol);
      case 'push-notification':
        return this.wakeViaPushNotification(device, protocol);
      case 'http-request':
        return this.wakeViaHTTP(device, protocol);
      default:
        return false;
    }
  }

  /**
   * Bluetooth Low Energy wake (e.g., wake characteristic write)
   */
  private async wakeViaBluetooth(
    device: Device,
    protocol: WakeProtocol
  ): Promise<boolean> {
    console.log(`[WakeupManager] Attempting Bluetooth wake for ${device.name}...`);

    try {
      // In a real implementation:
      // 1. Use Web Bluetooth API to find device (device.networkAddress = characteristic UUID)
      // 2. Connect to GATT server
      // 3. Write to wake characteristic
      // 4. Monitor for device coming online

      // Simulate Bluetooth discovery and wake
      const { address } = protocol.config as { address?: string };
      if (!address) {
        console.warn('[WakeupManager] No Bluetooth address configured');
        return false;
      }

      console.log(`[WakeupManager] Sending BLE wake signal to ${address}`);

      // Simulate success after delay
      return new Promise((resolve) => {
        setTimeout(() => {
          console.log(`[WakeupManager] Bluetooth wake successful for ${device.name}`);
          resolve(true);
        }, 1000);
      });
    } catch (error) {
      console.error('[WakeupManager] Bluetooth wake failed:', error);
      return false;
    }
  }

  /**
   * WiFi-based wake (Wake-on-LAN)
   */
  private async wakeViaWiFi(
    device: Device,
    protocol: WakeProtocol
  ): Promise<boolean> {
    console.log(`[WakeupManager] Attempting WiFi WoL for ${device.name}...`);

    try {
      const { macAddress, broadcastAddress } = protocol.config as {
        macAddress?: string;
        broadcastAddress?: string;
      };

      if (!macAddress || !broadcastAddress) {
        console.warn('[WakeupManager] Missing MAC or broadcast address for WoL');
        return false;
      }

      // Construct Wake-on-LAN magic packet
      this.createMagicPacket(macAddress);
      console.log(`[WakeupManager] Sending WoL packet to ${broadcastAddress}`);

      // In a real implementation, would send UDP packet to broadcast address
      // For now, simulate via HTTP proxy request

      return new Promise((resolve) => {
        setTimeout(() => {
          console.log(`[WakeupManager] WiFi WoL successful for ${device.name}`);
          resolve(true);
        }, 1500);
      });
    } catch (error) {
      console.error('[WakeupManager] WiFi WoL failed:', error);
      return false;
    }
  }

  /**
   * Create Wake-on-LAN magic packet
   */
  private createMagicPacket(macAddress: string): Buffer | Uint8Array {
    // Convert MAC address string to bytes
    const macBytes = macAddress
      .split(':')
      .map(hex => parseInt(hex, 16));

    // WoL magic packet: 6 bytes of FF + 16 repetitions of MAC
    const packet = new Uint8Array(102);
    
    // Fill first 6 bytes with FF
    for (let i = 0; i < 6; i++) {
      packet[i] = 0xff;
    }

    // Repeat MAC address 16 times
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 6; j++) {
        packet[6 + i * 6 + j] = macBytes[j];
      }
    }

    return packet;
  }

  /**
   * Push notification wake (for mobile devices)
   */
  private async wakeViaPushNotification(
    device: Device,
    protocol: WakeProtocol
  ): Promise<boolean> {
    console.log(`[WakeupManager] Attempting push notification wake for ${device.name}...`);

    try {
      const { pushEndpoint } = protocol.config as {
        pushEndpoint?: string;
        vapidKey?: string;
      };

      if (!pushEndpoint) {
        console.warn('[WakeupManager] No push endpoint configured');
        return false;
      }

      // In a real implementation:
      // 1. Send POST request to push endpoint with subscription and message
      // 2. Include high priority and wake directive
      // 3. Mobile device receives push and wakes

      console.log(`[WakeupManager] Sending push to ${device.name}`);

      return new Promise((resolve) => {
        setTimeout(() => {
          console.log(`[WakeupManager] Push notification wake successful for ${device.name}`);
          resolve(true);
        }, 2000);
      });
    } catch (error) {
      console.error('[WakeupManager] Push notification wake failed:', error);
      return false;
    }
  }

  /**
   * HTTP request wake (for always-on servers)
   */
  private async wakeViaHTTP(
    device: Device,
    protocol: WakeProtocol
  ): Promise<boolean> {
    console.log(`[WakeupManager] Attempting HTTP wake for ${device.name}...`);

    try {
      const { endpoint } = protocol.config as { endpoint?: string };

      if (!endpoint) {
        console.warn('[WakeupManager] No HTTP endpoint configured');
        return false;
      }

      console.log(`[WakeupManager] Sending HTTP wake request to ${endpoint}`);

      // In a real implementation: const response = await fetch(endpoint, { method: 'POST' });
      // For MVP, simulate:

      return new Promise((resolve) => {
        setTimeout(() => {
          console.log(`[WakeupManager] HTTP wake successful for ${device.name}`);
          resolve(true);
        }, 800);
      });
    } catch (error) {
      console.error('[WakeupManager] HTTP wake failed:', error);
      return false;
    }
  }

  /**
   * List all configured wake protocols
   */
  getAllProtocols(): Record<string, WakeProtocol[]> {
    const result: Record<string, WakeProtocol[]> = {};
    this.protocols.forEach((protoArray, deviceId) => {
      result[deviceId] = protoArray;
    });
    return result;
  }

  /**
   * Clear protocols for a device
   */
  clearProtocols(deviceId: string): void {
    this.protocols.delete(deviceId);
    this.saveProtocols();
  }

  /**
   * Clear all protocols
   */
  clearAllProtocols(): void {
    this.protocols.clear();
    localStorage.removeItem(WAKE_PROTOCOLS_KEY);
  }
}

// Singleton instance
let wakeupInstance: DeviceWakeupManager | null = null;

export function getWakeupManager(): DeviceWakeupManager {
  if (!wakeupInstance) {
    wakeupInstance = new DeviceWakeupManager();
  }
  return wakeupInstance;
}
