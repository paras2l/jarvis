import { launchOrchestrator } from '@/core/platform/launch-orchestrator'
import { SkillDefinition } from '@/core/skills/types'

export const openApplicationSkill: SkillDefinition = {
  id: 'builtin.open-application',
  name: 'Open Application',
  description: 'Launches a desktop, web, or mobile app by name.',
  category: 'automation',
  tags: ['open', 'launch', 'application', 'app'],
  aliases: ['open app', 'launch app', 'start app'],
  version: '1.0.0',
  origin: 'builtin',
  enabled: true,
  permissions: ['launch_app'],
  handler: async (input) => {
    const appName = typeof input === 'string'
      ? input
      : String((input as Record<string, unknown>)?.app || (input as Record<string, unknown>)?.appName || '').trim()

    if (!appName) {
      return {
        success: false,
        message: 'No application name was provided.',
      }
    }

    const result = await launchOrchestrator.launchApp(appName, {
      sensitiveOperation: Boolean((input as Record<string, unknown>)?.sensitiveOperation),
    })

    return {
      success: result.success,
      message: result.message,
      data: {
        strategy: result.strategy,
        platform: result.platform,
        launchabilityState: result.launchabilityState,
      },
    }
  },
}
