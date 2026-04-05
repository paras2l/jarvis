import { PlatformId } from './types'

export function detectPlatform(): PlatformId {
  if (typeof navigator === 'undefined') {
    return 'web'
  }

  const ua = navigator.userAgent.toLowerCase()

  if (ua.includes('android')) {
    return 'android'
  }

  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    return 'ios'
  }

  if (ua.includes('win')) {
    return 'windows'
  }

  if (ua.includes('mac')) {
    return 'macos'
  }

  if (ua.includes('linux')) {
    return 'linux'
  }

  return 'web'
}
