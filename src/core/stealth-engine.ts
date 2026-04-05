/**
 * Stealth Engine — Background & Headless Task Execution
 * 
 * Determines whether the agent should execute tasks visibly (UI Automation)
 * or invisantly in the background (Headless / API / Android Intents) to 
 * avoid interrupting the user's active session (e.g. while gaming).
 */

import { platformAdapter } from './platform-adapter';

export type ExecutionMode = 'api' | 'headless' | 'intent' | 'ui' | 'pause';

export interface AppTask {
  targetApp: string;
  action: string;
  payload: any;
  requiresUI: boolean; // Does the app explicitly forbid headless API?
}

class StealthEngine {
  
  /**
   * Evaluates the task and current user context to pick the optimal execution mode.
   */
  async determineOptimalMode(task: AppTask): Promise<ExecutionMode> {
    const isBusy = await platformAdapter.isUserBusy();
    const isMobile = platformAdapter.isMobile();

    console.log(`🥷 [StealthEngine] User Busy: ${isBusy} | Mobile: ${isMobile}`);

    // If there's an active API, always use that first (zero interruption)
    if (this.hasApiSupport(task.targetApp)) {
      return 'api';
    }

    if (isBusy) {
      if (isMobile && this.hasIntentSupport(task.targetApp)) {
        // Mobile gaming -> Send deep background intent
        return 'intent';
      }
      
      if (!task.requiresUI) {
        // Desktop gaming -> Use headless invisible browser
        return 'headless';
      }

      // App requires UI automation but user is busy playing game -> Pause/Fallback
      console.warn(`🥷 [StealthEngine] UI Automation required but user is busy. PAUSING.`);
      return 'pause'; // Wait for permission
    }

    // User is not busy, fine to use standard UI automation (Vision/Mouse)
    return 'ui';
  }

  /**
   * Execute a task dynamically based on the optimal mode.
   */
  async executeStealthTask(task: AppTask): Promise<{ success: boolean; message: string }> {
    const mode = await this.determineOptimalMode(task);
    console.log(`🥷 [StealthEngine] Routing task via mode: [${mode.toUpperCase()}]`);

    switch(mode) {
      case 'api':
        return this.executeViaApi(task);
      case 'headless':
        return this.executeViaHeadless(task);
      case 'intent':
        return this.executeViaIntent(task);
      case 'ui':
        return { success: false, message: 'Delegating back to UI TaskExecutor' };
      case 'pause':
        return { success: false, message: 'Paused. Waiting for user permission to interrupt active app.' };
      default:
        return { success: false, message: 'Unknown stealth mode' };
    }
  }

  // ── Mocks / Stubs for actual integration ─────────────────────────────────

  private hasApiSupport(app: string): boolean {
    const apiSupported = ['discord', 'telegram', 'spotify'];
    return apiSupported.includes(app.toLowerCase());
  }

  private hasIntentSupport(app: string): boolean {
    const intentSupported = ['whatsapp', 'phone', 'messages'];
    return intentSupported.includes(app.toLowerCase());
  }

  private async executeViaApi(task: AppTask) {
    return { success: true, message: `Executed silent API call to ${task.targetApp}.` };
  }

  private async executeViaHeadless(task: AppTask) {
    return { success: true, message: `Spun up invisible CDP browser to interact with ${task.targetApp} secretly.` };
  }

  private async executeViaIntent(task: AppTask) {
    return { success: true, message: `Fired deep Android background intent to ${task.targetApp}.` };
  }
}

export const stealthEngine = new StealthEngine();
