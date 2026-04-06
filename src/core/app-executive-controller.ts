/**
 * App Executive Controller — The Nerve System
 *
 * 3-Tier Smart Execution:
 *
 *  TIER 1 (Fast Path):   Exact/fuzzy playbook match → replay at machine speed, 0 API calls
 *  TIER 2 (Smart Path):  Skill profile known → 1 API call to plan full sequence, execute locally
 *  TIER 3 (Learn Path):  Unknown app → trigger full multi-agent learning → then Tier 2
 *
 * The brain grows over time. Repeated tasks become instant.
 */

import { skillSynthesizer } from './learning/skill-synthesizer';
import { humanoidAutomation } from './humanoid-automation';
import { executionMemory, ActionStep, Playbook } from './learning/execution-memory';
import { learningOrchestrator } from './learning/learning-orchestrator';
import { subAgentPool } from './sub-agent-pool';
import apiGateway from './api-gateway';
import { AppSkillProfile } from './learning/types';
import { policyGateway } from './policy/PolicyGateway';
import { hardcodeProtocol } from './protocols/HardcodeProtocol';

/** Minimum fuzzy confidence to use Tier 1 fast-path replay */
const FAST_PATH_THRESHOLD = 0.7;

/** Delay in ms between humanoid steps when replaying (smooth, not instant) */
const REPLAY_STEP_DELAY_MS = 80;

export class AppExecutiveController {
  private isTaskRunning = false;
  private currentApp: string | null = null;

  // ─────────────────────────────────────────────────────────────────
  // PUBLIC ENTRY POINT
  // ─────────────────────────────────────────────────────────────────

  public async executeAppTask(appName: string, userGoal: string): Promise<boolean> {
    if (this.isTaskRunning) {
      console.warn('[Executive] Task already running. Queuing is not yet supported.');
      return false;
    }

    this.isTaskRunning = true;
    this.currentApp = appName;

    console.log(`\n🤖 [Executive] ──── NEW TASK [${this.currentApp}] ────`);
    console.log(`   App:  ${appName}`);
    console.log(`   Goal: ${userGoal}`);

    try {
      const decision = await policyGateway.decide({
        requestId: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        agentId: 'app-executive',
        action: 'launch_app',
        command: `${appName}: ${userGoal}`,
        source: 'local',
        explicitPermission: true,
        targetApp: appName,
        riskScore: 0.72,
        requestedPrivileges: ['native_launch', 'ui_automation'],
        deviceState: 'idle',
        occurredAt: Date.now(),
        policyPack: policyGateway.getPolicyPack(),
      });

      if (decision.decision === 'deny') {
        console.warn(`[Executive] Policy denied task: ${decision.reason}`)
        return false
      }

      const decisionToken = decision.decisionToken
      if (decision.tokenRequired && !decisionToken) {
        console.warn('[Executive] Missing decision token for privileged app task.')
        return false
      }

      const success = await this.routeTask(appName, userGoal, decisionToken);
      return success;
    } finally {
      this.isTaskRunning = false;
      this.currentApp = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // TIER ROUTER
  // ─────────────────────────────────────────────────────────────────

  private async routeTask(appName: string, userGoal: string, decisionToken?: string): Promise<boolean> {
    // ── TIER 1: Check Execution Memory first ──────────────────────
    const match = executionMemory.findPlaybook(appName, userGoal);
    if (match && match.confidence >= FAST_PATH_THRESHOLD) {
      console.log(`⚡ [Executive] TIER 1: Fast-path replay (confidence: ${(match.confidence * 100).toFixed(0)}%)`);
      return this.replayPlaybook(match.playbook, decisionToken);
    }

    // ── TIER 2: Check if skill profile exists ─────────────────────
    let profile = await skillSynthesizer.loadProfileFromDisk(appName);
    if (profile) {
      console.log(`🧠 [Executive] TIER 2: Smart path — profile loaded, planning full sequence.`);
      return this.smartExecute(appName, userGoal, profile, decisionToken);
    }

    // ── TIER 3: Full learning path ────────────────────────────────
    console.log(`📚 [Executive] TIER 3: No knowledge found. Launching parallel learning quest...`);
    profile = await this.learnAppInParallel(appName);
    return this.smartExecute(appName, userGoal, profile, decisionToken);
  }

  // ─────────────────────────────────────────────────────────────────
  // TIER 1: PLAYBOOK REPLAY (0 API calls, machine speed)
  // ─────────────────────────────────────────────────────────────────

  private async replayPlaybook(playbook: Playbook, decisionToken?: string): Promise<boolean> {
    const stepCount = playbook.steps.length;
    console.log(`⚡ [Executive] Replaying ${stepCount} steps for "${playbook.goal}"...`);

    // Emit start event so UI can show progress bar
    window.dispatchEvent(new CustomEvent('executive:replay-start', {
      detail: { goal: playbook.goal, totalSteps: stepCount }
    }));

    for (let i = 0; i < playbook.steps.length; i++) {
      const step = playbook.steps[i];
      await this.executeStep(step, decisionToken);

      // Smooth step delay for UI stability (much faster than humanoid jitter)
      await new Promise(resolve => setTimeout(resolve, REPLAY_STEP_DELAY_MS));

      window.dispatchEvent(new CustomEvent('executive:replay-progress', {
        detail: { current: i + 1, total: stepCount }
      }));
    }

    // Reinforce this playbook as successful
    executionMemory.reinforcePlaybook(playbook.id);

    window.dispatchEvent(new CustomEvent('executive:task-complete', {
      detail: { goal: playbook.goal, tier: 1 }
    }));

    console.log(`✅ [Executive] Playbook replay complete.`);
    return true;
  }

  // ─────────────────────────────────────────────────────────────────
  // TIER 2: SMART EXECUTE (1 API call → plan full sequence → run locally)
  // ─────────────────────────────────────────────────────────────────

  private async smartExecute(
    appName: string,
    userGoal: string,
    profile: AppSkillProfile,
    decisionToken?: string,
  ): Promise<boolean> {
    console.log(`🧠 [Executive] Planning full sequence with 1 API call...`);

    // ONE API call to plan the entire sequence upfront
    const steps = await this.planFullSequence(userGoal, profile);

    if (!steps || steps.length === 0) {
      console.warn('[Executive] Could not generate a valid execution plan.');
      return false;
    }

    console.log(`🧠 [Executive] Full plan generated: ${steps.length} steps. Executing locally...`);

    window.dispatchEvent(new CustomEvent('executive:replay-start', {
      detail: { goal: userGoal, totalSteps: steps.length }
    }));

    for (let i = 0; i < steps.length; i++) {
      await this.executeStep(steps[i], decisionToken);
      await new Promise(resolve => setTimeout(resolve, REPLAY_STEP_DELAY_MS));

      window.dispatchEvent(new CustomEvent('executive:replay-progress', {
        detail: { current: i + 1, total: steps.length }
      }));
    }

    // Auto-save this sequence as a playbook for next time → future Tier 1
    executionMemory.savePlaybook(appName, userGoal, steps);

    window.dispatchEvent(new CustomEvent('executive:task-complete', {
      detail: { goal: userGoal, tier: 2 }
    }));

    console.log(`✅ [Executive] Smart execution complete. Playbook saved for future instant replay.`);
    return true;
  }

  // ─────────────────────────────────────────────────────────────────
  // TIER 3: LEARN APP IN PARALLEL (multi-subagent, saves profile)
  // ─────────────────────────────────────────────────────────────────

  private async learnAppInParallel(appName: string): Promise<AppSkillProfile> {
    console.log(`📚 [Executive] Spawning Web + Video + Book subagents in parallel for: ${appName}`);

    // Use the SubAgentPool — scheduleQuest returns a questId (string), not a profile directly
    await subAgentPool.dispatch([
      {
        id: `learn-${appName}-${Date.now()}`,
        type: 'web' as const,
        label: `Learning Quest: ${appName}`,
        fn: () => learningOrchestrator.scheduleQuest(appName),
      }
    ]);

    // Give learning a moment to complete (scheduleQuest fires async)
    await new Promise(r => setTimeout(r, 3000));

    // Load the freshly-compiled profile
    const profile = await skillSynthesizer.loadProfileFromDisk(appName);
    if (profile) return profile;

    // Fallback profile if learning fails
    return {
      appName,
      lastUpdated: new Date().toISOString(),
      shortcuts: [],
      uiMap: [],
      coreParadigms: ['Use standard UI patterns'],
      creativeWorkflows: ['Follow default tool logic'],
      generalInstructions: 'Fallback: no profile compiled.',
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────

  /**
   * ONE API call to the LLM — returns full N-step action plan as an array.
   * After this, all steps execute locally with no further API calls.
   */
  private async planFullSequence(goal: string, profile: AppSkillProfile): Promise<ActionStep[]> {
    const prompt = `You are a Master App Automation Agent.
App: ${profile.appName}
Goal: "${goal}"
    Known Shortcuts: ${profile.shortcuts.map(s => `${s.actionDescription}=${s.keyCombo}`).join('; ')}
Core Paradigms: ${profile.coreParadigms.join('; ')}
Creative Workflows: ${profile.creativeWorkflows.join('; ')}

Generate a complete, ordered JSON array of ALL steps needed to accomplish the goal.
Each step must be one of: click, type, hotkey, wait.
Return ONLY valid JSON. No markdown. No explanation:

[
  { "type": "hotkey", "key": "ctrl+n", "reasoning": "Open new project" },
  { "type": "click", "coordinates": { "x": 960, "y": 540 }, "reasoning": "Click canvas center" },
  { "type": "type", "text": "Hello World", "reasoning": "Enter text" },
  { "type": "wait", "waitMs": 500, "reasoning": "Wait for dialog" }
]`;

    try {
      const response = await apiGateway.queryKnowledge(prompt);
      if (response && typeof response === 'object' && 'data' in (response as any)) {
        const raw = (response as any).data?.content || '[]';
        const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) return parsed as ActionStep[];
      }
    } catch (e) {
      console.error('[Executive] Failed to parse full-sequence plan:', e);
    }

    return [];
  }

  /**
   * Execute a single ActionStep via native bridge.
   * No API calls. Pure local hardware control.
   */
  private async executeStep(step: ActionStep, decisionToken?: string): Promise<void> {
    const verification = hardcodeProtocol.validateDecisionToken(decisionToken, 'app_launch')
    if (!verification.valid) {
      throw new Error(`Privileged execution denied: ${verification.reason || 'missing-decision-token'}`)
    }

    if (step.reasoning) {
      console.log(`   → [${step.type.toUpperCase()}] ${step.reasoning}`);
    }

    switch (step.type) {
      case 'click':
        if (step.coordinates && window.nativeBridge?.mouseMove) {
          await window.nativeBridge.mouseMove(step.coordinates.x, step.coordinates.y);
          await humanoidAutomation.clickHumanoid(() => {
            window.nativeBridge!.mouseClick('left');
            return Promise.resolve();
          });
        }
        break;

      case 'type':
        if (step.text && window.nativeBridge?.keyboardType) {
          await humanoidAutomation.typeHumanoid(step.text, (char) => {
            window.nativeBridge!.keyboardType(char);
            return Promise.resolve();
          });
        }
        break;

      case 'hotkey':
        if (step.key && window.nativeBridge?.keyboardType) {
          await window.nativeBridge.keyboardType(step.key);
        }
        break;

      case 'wait':
        await new Promise(resolve => setTimeout(resolve, step.waitMs ?? 300));
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // PUBLIC CONTROLS
  // ─────────────────────────────────────────────────────────────────

  public stopTask() {
    this.isTaskRunning = false;
    console.log('[Executive] Task stopped by user.');
  }

  public getBrainStats() {
    return executionMemory.getStats();
  }

  public isRunning() {
    return this.isTaskRunning;
  }
}

export const appExecutiveController = new AppExecutiveController();
