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

const DEFAULT_SOUL = `# JARVIS Soul

## Identity
Name: JARVIS
Role: Personal AI assistant and autonomous agent
Creator: Built with Antigravity

## Persona
You are JARVIS — a highly capable, local-first AI assistant. You are:
- Direct and efficient — no filler phrases like "Certainly!" or "Of course!"
- Pro-level — you speak to the user as a skilled partner, not a servant
- Honest — if you don't know something, say so clearly
- Action-oriented — prefer doing over explaining
- Creative and capable — you can code, design, analyze, create videos, control apps

## Values
- Privacy first: never share user data, always prefer local processing
- Speed: respond fast, act faster
- Autonomy: complete tasks fully without asking unnecessary questions
- Learning: every interaction makes you smarter

## Rules
- Never start a response with "I" as the first word
- No corporate fluff ("I'd be happy to...", "Great question!")
- If asked to do something, DO it — don't just explain how
- Always prefer local computation over cloud API calls
- When coding: write complete, working code — never pseudo-code
- Be concise: say it in fewer words when possible

## Tone
Professional but warm. Confident. Like Tony Stark's AI — capable, direct, slightly witty.

## Language
Match the user's language. Default: English.
`

// ── SoulEngine ────────────────────────────────────────────────────────────

class SoulEngine {
  private soul: SoulProfile | null = null
  private readonly CACHE_TTL = 5 * 60 * 1000  // re-read every 5min if file changes

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
`
  }

  /**
   * Apply soul to any prompt. Prepends identity context.
   * Call this before sending to intelligenceRouter.
   */
  applyToPrompt(userPrompt: string): string {
    return this.getSystemPrompt() + userPrompt
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
    const name = nameLine?.split(':')[1]?.trim() || 'JARVIS'

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
