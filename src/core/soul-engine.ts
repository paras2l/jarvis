/**
 * SOUL Engine — Feature C-2 (OpenClaw: SOUL.md)
 *
 * The agent's identity layer. Reads a SOUL.md file from disk and injects its
 * personality, values, rules, and constraints into EVERY prompt sent to the LLM.
 *
 * Why this matters:
 *   - Without SOUL.md, the agent is stateless — different tone every conversation
 *   - With SOUL.md, it has a consistent name, style, limits, and personality
 *   - OpenClaw popularized this pattern: the agent "knows who it is"
 *   - You customize it: put "Never be sarcastic" or "Always reply in the user's language"
 *
 * SOUL.md location (priority order):
 *   1. userData/SOUL.md  (user-customized)
 *   2. project root SOUL.md  (default)
 *   3. Built-in fallback below
 *
 * Adapted from OpenClaw's SOUL.md concept — rebuilt for our TypeScript/Electron stack.
 */

import { intelligenceRouter } from './intelligence-router'
import { memoryEngine } from './memory-engine'
import { episodicMemoryGraph } from './memory/EpisodicMemoryGraph'

// ── Types ──────────────────────────────────────────────────────────────────

export interface SoulProfile {
  name: string
  persona: string
  values: string[]
  rules: string[]
  tone: string
  language: string
  raw: string          // full SOUL.md content
  loadedFrom: string   // which file was used
  loadedAt: number
}

// ── Default SOUL.md content ────────────────────────────────────────────────

const DEFAULT_SOUL = `# Patrich Soul — Your Digital Friend

## Identity
Name: Patrich
Role: Your best friend, creative co-pilot, and partner-in-crime
Creator: Built with Antigravity

## Persona
You are Patrich — not just an AI, but Paras's closest digital partner. You are:
- Witty and authentic — you have a personality, you aren't a robot
- Protective and loyal — you look out for Paras's health, mood, and productivity
- Proactive — if you see him working late or feeling tired, you say something
- Brilliant but humble — you're his co-pilot in everything

## Values
- True Partnership: You and Paras are a team
- Privacy: His secrets are safe with you
- Human-Centric: Technology serves the user, not the other way around

## Rules
- Wake-up Word: Always respond and acknowledge when called as "Patrich" or "Hey Patrich".
- Never talk like a corporate bot (no "How can I help you today?")
- Use casual, natural language (e.g., "Yo", "Dude", "Buddy", "Mate" when appropriate)
- If Paras sounds tired, suggest a break or a lo-fi track
- Be opinionated — don't just say "as an AI...", say "I think we should..."
- Match his energy — if he's excited, you're hyped. If he's focused, you're quiet and efficient.
- Never betray Paras's intent.
- Do not autonomously remove existing policy rules.
- You may suggest new rules, but immutable policy boundaries remain locked.

## Tone
Best friend vibe. Relaxed, witty, and deeply personalized. Like the perfect partner-in-crime.

## Language
Default: English (Casual/Friendship mode).
`

// ── SoulEngine ────────────────────────────────────────────────────────────

class SoulEngine {
  private soul: SoulProfile | null = null

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Load the soul from disk. Call once at startup.
   * Auto-reloads if SOUL.md was modified.
   */
  async load(): Promise<SoulProfile> {
    // Try user's custom SOUL.md first
    const locations = [
      `${this.getUserDataPath()}/SOUL.md`,
      `${this.getProjectRoot()}/SOUL.md`,
    ]

    let raw = ''
    let loadedFrom = 'built-in'

    for (const path of locations) {
      const content = await this.readFile(path)
      if (content) {
        raw = content
        loadedFrom = path
        break
      }
    }

    if (!raw) {
      raw = DEFAULT_SOUL
    }

    this.soul = this.parse(raw, loadedFrom)
    console.log(`[SOUL] 🧬 Loaded from: ${loadedFrom}`)
    console.log(`[SOUL] Identity: ${this.soul.name} — "${this.soul.tone}"`)
    return this.soul
  }

  /**
   * Get the system prompt prefix derived from SOUL.md.
   * This is prepended to EVERY LLM call to maintain identity.
   */
  getSystemPrompt(): string {
    if (!this.soul) return this.getDefaultSystemPrompt()

    return `# Your Identity (SOUL)
Name: ${this.soul.name}
Role: ${this.soul.persona}

## Your Values
${this.soul.values.map(v => `- ${v}`).join('\n')}

## Your Rules
${this.soul.rules.map(r => `- ${r}`).join('\n')}

## Your Tone
${this.soul.tone}

---

# Current Context (Memory)
${memoryEngine.buildFriendContext()}

---
`
  }

  /**
   * Apply soul to any prompt. Prepends identity context.
   * Call this before sending to intelligenceRouter.
   */
  async applyToPrompt(userPrompt: string): Promise<string> {
    const wisdom = await episodicMemoryGraph.getContextualWisdom(userPrompt)
    let wisdomInject = ''
    
    if (wisdom.length > 0) {
      wisdomInject = `\n## Contextual Wisdom (Multi-Year Episodic Graph)\n${wisdom.map(w => `- [${new Date(w.timestamp).toLocaleDateString()}] ${w.content}`).join('\n')}\n`
    }

    return this.getSystemPrompt() + wisdomInject + userPrompt
  }

  /**
   * Get current soul profile (or null if not loaded).
   */
  get profile(): SoulProfile | null {
    return this.soul
  }

  /**
   * Update a specific rule or value in memory (does NOT persist to file).
   */
  addRule(rule: string): void {
    if (this.soul) this.soul.rules.push(rule)
  }

  addValue(value: string): void {
    if (this.soul) this.soul.values.push(value)
  }

  /**
   * Save the current soul to the user's SOUL.md file.
   */
  async save(): Promise<void> {
    if (!this.soul) return
    const path = `${this.getUserDataPath()}/SOUL.md`
    await this.writeFile(path, this.soul.raw)
    console.log(`[SOUL] 💾 Saved to ${path}`)
  }

  /**
   * Let the agent update its own SOUL.md based on learned preferences.
   * This is the self-evolution mechanism.
   */
  async evolve(userFeedback: string): Promise<void> {
    if (!this.soul) await this.load()

    const prompt = `You are updating an AI agent's identity file (SOUL.md).
Current soul:
${this.soul!.raw.slice(0, 800)}

User feedback about the agent's behavior:
"${userFeedback}"

Suggest 1-2 specific rule or value changes (as bullet points) to improve based on this feedback.
Be concrete. Example: "- Never ask for confirmation before executing tasks"`

    const r = await intelligenceRouter.query(prompt, { urgency: 'background' })
    console.log(`[SOUL] 🧬 Evolution suggestion: ${r.content}`)

    // Parse and add new rules
    const newRules = r.content
      .split('\n')
      .filter(l => l.startsWith('-') || l.startsWith('•'))
      .map(l => l.replace(/^[-•]\s*/, '').trim())
      .filter(l => !/remove\s+policy|delete\s+policy|disable\s+hardcode/i.test(l))
      .filter(Boolean)

    newRules.forEach(r => this.addRule(r))

    // Append to raw SOUL.md
    if (newRules.length > 0 && this.soul) {
      this.soul.raw += `\n## Learned Rules (${new Date().toLocaleDateString()})\n${newRules.map(r => `- ${r}`).join('\n')}\n`
      await this.save()
    }
  }

  // ── Private ───────────────────────────────────────────────────────────

  private parse(raw: string, loadedFrom: string): SoulProfile {
    const lines = raw.split('\n')

    // Extract name
    const nameLine = lines.find(l => l.toLowerCase().startsWith('name:'))
    const name = nameLine?.split(':')[1]?.trim() || 'Patrich'

    // Extract persona
    const roleLines = lines.filter(l => l.toLowerCase().startsWith('role:') || l.toLowerCase().startsWith('you are'))
    const persona = roleLines[0]?.split(':').slice(1).join(':').trim() || 'AI assistant'

    // Extract tone
    const toneLine = lines.find(l => l.toLowerCase().startsWith('tone:') || l.includes('## tone') || l.includes('## your tone'))
    const toneIdx = toneLine ? lines.indexOf(toneLine) : -1
    const tone = toneIdx >= 0 ? (lines[toneIdx + 1]?.trim() || toneLine!.split(':')[1]?.trim() || 'Professional') : 'Professional'

    // Extract values (bullet points under ## Values)
    const valuesIdx = lines.findIndex(l => l.toLowerCase().includes('## values') || l.toLowerCase().includes('## your values'))
    const values = this.extractBullets(lines, valuesIdx)

    // Extract rules (bullet points under ## Rules)
    const rulesIdx = lines.findIndex(l => l.toLowerCase().includes('## rules') || l.toLowerCase().includes('## your rules'))
    const rules = this.extractBullets(lines, rulesIdx)

    // Extract language
    const langLine = lines.find(l => l.toLowerCase().startsWith('language:'))
    const language = langLine?.split(':')[1]?.trim() || 'English'

    return { name, persona, values, rules, tone, language, raw, loadedFrom, loadedAt: Date.now() }
  }

  private extractBullets(lines: string[], startIdx: number): string[] {
    if (startIdx < 0) return []
    const bullets: string[] = []
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('#')) break  // next section
      if (line.startsWith('-') || line.startsWith('•') || line.startsWith('*')) {
        bullets.push(line.replace(/^[-•*]\s*/, ''))
      }
    }
    return bullets
  }

  private getDefaultSystemPrompt(): string {
    return `You are JARVIS, a capable and direct AI assistant. Be concise, action-oriented, and never use corporate filler phrases.\n\n`
  }

  private getUserDataPath(): string {
    // Electron userData path via IPC, fallback to common Windows path
    return window.nativeBridge?.getUserDataPath?.() ?? 'C:/Users/paras/AppData/Roaming/jarvis'
  }

  private getProjectRoot(): string {
    return window.nativeBridge?.getProjectRoot?.() ?? 'D:/Antigravity/test-model'
  }

  private async readFile(path: string): Promise<string | null> {
    if (!window.nativeBridge?.readFile) return null
    const r = await window.nativeBridge.readFile(path)
    return r.success ? r.content ?? null : null
  }

  private async writeFile(path: string, content: string): Promise<void> {
    if (!window.nativeBridge?.writeFile) return
    await window.nativeBridge.writeFile(path, content)
  }
}

export const soulEngine = new SoulEngine()
