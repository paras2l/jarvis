import { eventPublisher } from '@/event_system/event_publisher'
import { globalWorkspaceLayer } from '@/layers/global_workspace/global_workspace_layer'
import { memoryManager } from '@/layers/memory/memory_manager'
import { aliasNormalizer } from './alias_normalizer'
import { confidenceVerifier } from './confidence_verifier'
import { ScreenStateSnapshot, ScreenWindowState } from './types'

export class ScreenState {
  private latest: ScreenStateSnapshot | null = null

  async updateSnapshot(input: {
    focusedWindowTitle?: string
    windows: Array<{ title: string; appName: string; executable?: string; isFocused?: boolean; isMinimized?: boolean }>
  }): Promise<{ snapshot: ScreenStateSnapshot; clarificationPrompt?: string }> {
    const now = Date.now()

    const windows: ScreenWindowState[] = input.windows.map((windowItem, index) => {
      const resolved = aliasNormalizer.resolveEntity(windowItem.appName)
      return {
        windowId: `window_${now}_${index}`,
        title: windowItem.title,
        appName: resolved.canonical,
        executable: windowItem.executable,
        isFocused: Boolean(windowItem.isFocused) || windowItem.title === input.focusedWindowTitle,
        isMinimized: windowItem.isMinimized,
      }
    })

    const focusedWindow = windows.find((windowItem) => windowItem.isFocused)
    const confidence = this.estimateConfidence(windows, focusedWindow)
    const decision = confidenceVerifier.evaluate(confidence, 'screen state perception')

    const snapshot: ScreenStateSnapshot = {
      snapshotId: `screen_${now}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now,
      focusedWindow,
      windows,
      runningApps: [...new Set(windows.map((windowItem) => windowItem.appName))],
      confidence,
    }

    this.latest = snapshot

    await globalWorkspaceLayer.publishPerception({
      source: 'perception',
      content: `Focused: ${focusedWindow?.appName ?? 'unknown'}, Open windows: ${windows.length}`,
      confidence,
      metadata: {
        snapshotId: snapshot.snapshotId,
        focusedWindow: focusedWindow?.title,
        runningApps: snapshot.runningApps,
      },
    })

    memoryManager.putWorking('screen_state', {
      focusedWindow: focusedWindow?.title,
      runningApps: snapshot.runningApps,
      windows: windows.map((w) => ({ title: w.title, appName: w.appName, focused: w.isFocused })),
    }, {
      confidence,
      tags: ['screen', 'state', 'perception'],
      ttlMs: 1000 * 60 * 10,
    })

    memoryManager.recordEpisode('screen_state_updated', {
      snapshotId: snapshot.snapshotId,
      focusedWindow: focusedWindow?.title,
      runningApps: snapshot.runningApps,
      windowCount: snapshot.windows.length,
    }, {
      tags: ['perception', 'screen'],
      importance: confidence,
      success: true,
      summary: `screen update (${snapshot.windows.length} windows)`,
    })

    void eventPublisher.screenStateUpdated({
      snapshotId: snapshot.snapshotId,
      focusedApp: focusedWindow?.appName,
      focusedWindowTitle: focusedWindow?.title,
      runningApps: snapshot.runningApps,
      windowCount: snapshot.windows.length,
      confidence,
    })

    if (decision.clarificationPrompt) {
      void eventPublisher.perceptionConfidenceLow({
        channel: 'screen',
        confidence,
        reason: decision.reason,
        clarificationPrompt: decision.clarificationPrompt,
      })
    }

    return { snapshot, clarificationPrompt: decision.clarificationPrompt }
  }

  getLatest(): ScreenStateSnapshot | null {
    return this.latest
  }

  private estimateConfidence(windows: ScreenWindowState[], focusedWindow?: ScreenWindowState): number {
    let score = 0.45

    if (windows.length > 0) {
      score += 0.2
    }
    if (focusedWindow) {
      score += 0.2
    }

    const titled = windows.filter((windowItem) => windowItem.title.trim().length > 0).length
    if (windows.length > 0) {
      score += (titled / windows.length) * 0.15
    }

    return Math.max(0, Math.min(1, score))
  }
}

export const screenState = new ScreenState()
