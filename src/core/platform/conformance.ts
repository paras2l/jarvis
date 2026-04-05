import { appIndexer } from './app-indexer'
import { capabilityChecker } from './capability-checker'
import { PermissionState, PlatformId } from './types'

export interface ConformanceCase {
  appName: string
  platform: PlatformId
  permissions: PermissionState
}

export interface ConformanceResult {
  appName: string
  platform: PlatformId
  pass: boolean
  messages: string[]
  expectedStrategies: string[]
  actualStrategies: string[]
  allowedSchemes: string[]
}

const DEFAULT_CASES: ConformanceCase[] = [
  { appName: 'Instagram', platform: 'windows', permissions: { nativeLaunch: true, uiAutomation: false } },
  { appName: 'WhatsApp', platform: 'android', permissions: { nativeLaunch: true, uiAutomation: false } },
  { appName: 'Spotify', platform: 'ios', permissions: { nativeLaunch: true, uiAutomation: false } },
  { appName: 'Google Maps', platform: 'macos', permissions: { nativeLaunch: true, uiAutomation: true } },
  { appName: 'Discord', platform: 'linux', permissions: { nativeLaunch: false, uiAutomation: false } },
]

function expectedOrder(platform: PlatformId, permissions: PermissionState): string[] {
  const order: string[] = []

  if (permissions.uiAutomation && ['windows', 'macos', 'linux', 'android'].includes(platform)) {
    order.push('ui_automation')
  }

  if (permissions.nativeLaunch) {
    if (platform === 'windows' || platform === 'macos' || platform === 'linux') {
      order.push('native_name', 'native_path')
    }

    if (platform === 'android' || platform === 'ios') {
      order.push('package_name')
    }
  }

  order.push('deep_link', 'web_search')
  return Array.from(new Set(order))
}

export function runConformanceSuite(cases: ConformanceCase[] = DEFAULT_CASES): ConformanceResult[] {
  return cases.map((testCase) => {
    const request = appIndexer.findCandidate(testCase.appName, testCase.platform)
    const actualStrategies = capabilityChecker.buildStrategyOrder(
      testCase.platform,
      request,
      testCase.permissions
    )
    const expectedStrategies = expectedOrder(testCase.platform, testCase.permissions)
    const allowedSchemes = appIndexer.getIosAllowedSchemes(testCase.appName)
    const messages: string[] = []

    if (!request.webFallback) {
      messages.push('Missing web fallback.')
    }

    if (testCase.platform === 'ios' && testCase.permissions.nativeLaunch && request.packageName) {
      if (allowedSchemes.length === 0) {
        messages.push('Missing iOS allow-list for app-specific scheme.')
      }
    }

    const pass =
      JSON.stringify(actualStrategies) === JSON.stringify(expectedStrategies) &&
      messages.length === 0

    if (!pass && messages.length === 0) {
      messages.push('Strategy order mismatch.')
    }

    return {
      appName: testCase.appName,
      platform: testCase.platform,
      pass,
      messages,
      expectedStrategies,
      actualStrategies,
      allowedSchemes,
    }
  })
}

export function summarizeConformance(results: ConformanceResult[]): { pass: boolean; failures: number } {
  const failures = results.filter((result) => !result.pass).length
  return {
    pass: failures === 0,
    failures,
  }
}
