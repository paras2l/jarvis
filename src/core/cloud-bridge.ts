import { MediaRuntimePolicy, MediaRuntimeTarget, MediaStageType } from './media-ml/types'
import { mediaCloudClient } from './media-ml/cloud-client'

type DeviceTier = 'low' | 'medium' | 'high'

export interface DeviceCapabilityProfile {
  tier: DeviceTier
  hardwareConcurrency: number
  estimatedMemoryGb: number
  supportsNativeBridge: boolean
}

class CloudBridge {
  isCloudAvailable(): boolean {
    return mediaCloudClient.isConfigured()
  }

  getDeviceProfile(): DeviceCapabilityProfile {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    const hardwareConcurrency = nav?.hardwareConcurrency ?? 4
    const estimatedMemoryGb = Number((nav as unknown as { deviceMemory?: number } | undefined)?.deviceMemory ?? 4)

    let tier: DeviceTier = 'low'
    if (hardwareConcurrency >= 8 && estimatedMemoryGb >= 8) {
      tier = 'high'
    } else if (hardwareConcurrency >= 6 || estimatedMemoryGb >= 6) {
      tier = 'medium'
    }

    return {
      tier,
      hardwareConcurrency,
      estimatedMemoryGb,
      supportsNativeBridge: Boolean(window?.nativeBridge),
    }
  }

  chooseRuntime(
    stageType: MediaStageType,
    policy: MediaRuntimePolicy,
  ): MediaRuntimeTarget {
    if (policy.mode === 'local-only') return 'local'
    if (policy.mode === 'cloud-only') {
      return this.isCloudAvailable() ? 'cloud' : 'local'
    }

    const profile = this.getDeviceProfile()

    if (stageType === 'script') return 'local'
    if (stageType === 'image' && policy.quality === 'draft') return 'local'

    if (profile.tier === 'high' && policy.quality !== 'premium') {
      return 'local'
    }

    if ((stageType === 'video' || stageType === 'avatar') && this.isCloudAvailable()) {
      return 'cloud'
    }

    if (profile.tier === 'low' && this.isCloudAvailable()) {
      return 'cloud'
    }

    return policy.quality === 'premium' && this.isCloudAvailable() ? 'cloud' : 'local'
  }
}

export const cloudBridge = new CloudBridge()
