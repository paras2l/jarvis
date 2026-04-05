import { appIndexer } from './app-indexer'
import { AppSelectorVariant, PlatformId } from './types'
import { automationTelemetry } from './automation-telemetry'

type DeviceContext = {
  deviceModel: string
  androidVersion: string
  locale: string
  oem?: string
}

function selectorKey(selector: AppSelectorVariant): string {
  if (selector.resourceId) return `resource-id:${selector.resourceId}`
  if (selector.contentDesc) return `content-desc:${selector.contentDesc}`
  if (selector.visibleText) return `visible-text:${selector.visibleText}`
  return 'unknown'
}

function scoreLocaleAndOem(selector: AppSelectorVariant, ctx: DeviceContext): number {
  let score = 0
  if (!selector.locale || selector.locale === ctx.locale) score += 2
  if (!selector.oem || selector.oem === ctx.oem) score += 1
  if (selector.resourceId) score += 3
  if (selector.contentDesc) score += 2
  if (selector.visibleText) score += 1
  return score
}

class AndroidSelectorLibrary {
  getPrioritizedSelectors(appName: string, ctx: DeviceContext): AppSelectorVariant[] {
    const base = appIndexer.getAppSelectors(appName, 'android' as PlatformId)
    if (!base.length) {
      return [{ visibleText: appName }, { contentDesc: appName }]
    }

    const sortedByMetadata = base
      .slice()
      .sort((a, b) => scoreLocaleAndOem(b, ctx) - scoreLocaleAndOem(a, ctx))

    const keys = sortedByMetadata.map(selectorKey)
    const rankedKeys = automationTelemetry.rankSelectors(
      appName,
      keys,
      ctx.deviceModel,
      ctx.androidVersion
    )

    const byKey = new Map<string, AppSelectorVariant>()
    sortedByMetadata.forEach((sel) => byKey.set(selectorKey(sel), sel))

    return rankedKeys.map((key) => byKey.get(key)).filter(Boolean) as AppSelectorVariant[]
  }
}

export const androidSelectorLibrary = new AndroidSelectorLibrary()
export { selectorKey }
