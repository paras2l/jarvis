import { AppSelectorVariant } from './types'

type StepResult = {
  success: boolean
  message?: string
  selectorUsed?: string
}

type StateMachineInput = {
  appName: string
  packageName?: string
  selectors: AppSelectorVariant[]
  timeoutMs: number
  retryCount: number
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ])
}

export async function runAndroidAutomationStateMachine(
  input: StateMachineInput
): Promise<{ success: boolean; reason: string; selectorUsed?: string }> {
  if (!window.nativeBridge) {
    return { success: false, reason: 'Native bridge unavailable.' }
  }

  const maxAttempts = Math.max(1, input.retryCount + 1)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const goHome = await withTimeout(
        window.nativeBridge.automationGoHome?.() ||
          Promise.resolve({ success: false, message: 'automationGoHome unavailable' }),
        input.timeoutMs,
        'open launcher'
      )

      if (!goHome.success) {
        continue
      }

      const openDrawer = await withTimeout(
        window.nativeBridge.automationOpenDrawer?.() ||
          Promise.resolve({ success: false, message: 'automationOpenDrawer unavailable' }),
        input.timeoutMs,
        'open app drawer'
      )

      if (!openDrawer.success) {
        continue
      }

      const search = await withTimeout(
        window.nativeBridge.automationSearchApp?.(input.appName) ||
          Promise.resolve({ success: false, message: 'automationSearchApp unavailable' }),
        input.timeoutMs,
        'search app'
      )

      if (!search.success) {
        continue
      }

      const findNode = (await withTimeout(
        window.nativeBridge.automationFindAppNode?.(input.selectors) ||
          Promise.resolve({ success: false, message: 'automationFindAppNode unavailable' }),
        input.timeoutMs,
        'find app node'
      )) as StepResult

      if (!findNode.success) {
        continue
      }

      const tap = await withTimeout(
        window.nativeBridge.automationTapFoundNode?.() ||
          Promise.resolve({ success: false, message: 'automationTapFoundNode unavailable' }),
        input.timeoutMs,
        'tap app icon'
      )

      if (!tap.success) {
        continue
      }

      const verify = await withTimeout(
        window.nativeBridge.automationVerifyForeground?.(input.packageName) ||
          Promise.resolve({ success: false, message: 'automationVerifyForeground unavailable' }),
        input.timeoutMs,
        'verify foreground package'
      )

      if (verify.success) {
        return {
          success: true,
          reason: `State machine success on attempt ${attempt}.`,
          selectorUsed: findNode.selectorUsed,
        }
      }

      // rollback to safe state before retry
      await window.nativeBridge.automationGoHome?.()
    } catch (error) {
      await window.nativeBridge.automationGoHome?.()
      if (attempt === maxAttempts) {
        const reason = error instanceof Error ? error.message : 'State machine failed.'
        return { success: false, reason }
      }
    }
  }

  return {
    success: false,
    reason: 'Automation state machine failed after retry. Could not verify foreground package.',
  }
}
