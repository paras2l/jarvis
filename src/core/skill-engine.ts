import { db } from '../lib/db'
import { builtinSkills } from '../skills'
import { skillSandboxExecutor } from './skill-sandbox'
import {
  SkillDefinition,
  SkillExecutionContext,
  SkillInput,
  SkillResult,
  SkillRuntimeApi,
  SkillSearchResult,
} from './skills/types'
import { memoryEngine } from './memory-engine'
import { researchEngine } from './research-engine'
import { semanticSearchEngine } from './semantic-search'
import { launchOrchestrator } from './platform/launch-orchestrator'

const STORAGE_KEY = 'jarvis.skill-registry.v1'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `skill-${Date.now()}`
}

function normalizeSkill(skill: SkillDefinition): SkillDefinition {
  return {
    ...skill,
    enabled: skill.enabled ?? true,
    origin: skill.origin ?? 'generated',
    tags: Array.from(new Set((skill.tags ?? []).map((tag) => tag.toLowerCase()))),
    aliases: Array.from(new Set((skill.aliases ?? []).map((alias) => alias.toLowerCase()))),
    permissions: skill.permissions ?? [],
    usageCount: skill.usageCount ?? 0,
    marketplaceState: skill.marketplaceState ?? (skill.enabled === false ? 'disabled' : 'installed'),
  }
}

class SkillEngine {
  private skills = new Map<string, SkillDefinition>()
  private ready: Promise<void>

  constructor() {
    this.ready = this.bootstrap()
  }

  private async bootstrap(): Promise<void> {
    for (const skill of builtinSkills) {
      this.skills.set(skill.id, normalizeSkill(skill))
    }

    const persisted = this.readPersistedSkills()
    for (const skill of persisted) {
      const normalized = normalizeSkill(skill)
      if (normalized.sourceCode && !normalized.handler) {
        const compiled = skillSandboxExecutor.compile(normalized.sourceCode)
        if (compiled.ok && compiled.handler) {
          normalized.handler = compiled.handler
        }
      }
      this.skills.set(normalized.id, normalized)
    }
  }

  async ensureReady(): Promise<void> {
    await this.ready
  }

  async listSkills(): Promise<SkillDefinition[]> {
    await this.ensureReady()
    return Array.from(this.skills.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  async search(query: string): Promise<SkillSearchResult[]> {
    await this.ensureReady()
    const normalized = query.trim().toLowerCase()
    if (!normalized) return []

    const tokens = normalized.split(/\s+/).filter(Boolean)
    return Array.from(this.skills.values())
      .filter((skill) => skill.enabled !== false)
      .map((skill) => {
        let score = 0
        const haystack = [skill.id, skill.name, skill.description, ...(skill.tags ?? []), ...(skill.aliases ?? [])]
          .join(' ')
          .toLowerCase()

        if (haystack.includes(normalized)) {
          score += 2.5
        }

        for (const token of tokens) {
          if (haystack.includes(token)) {
            score += 0.7
          }
        }

        if (skill.category && haystack.includes(skill.category)) {
          score += 0.25
        }

        return {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          category: skill.category,
          origin: skill.origin ?? 'generated',
          enabled: skill.enabled !== false,
          score: Math.min(1, score / 4),
          tags: skill.tags ?? [],
          aliases: skill.aliases ?? [],
        }
      })
      .filter((skill) => skill.score > 0)
      .sort((a, b) => b.score - a.score)
  }

  async findBestSkill(query: string): Promise<SkillDefinition | null> {
    const matches = await this.search(query)
    if (!matches.length) return null
    return this.skills.get(matches[0].id) ?? null
  }

  async registerSkill(skill: SkillDefinition, persist = true): Promise<SkillDefinition> {
    await this.ensureReady()
    const normalized = normalizeSkill(skill)

    if (normalized.sourceCode && !normalized.handler) {
      const compiled = skillSandboxExecutor.compile(normalized.sourceCode)
      if (compiled.ok && compiled.handler) {
        normalized.handler = compiled.handler
      }
    }

    if (!normalized.id) {
      normalized.id = slugify(normalized.name)
    }

    this.skills.set(normalized.id, normalized)
    this.persistCatalog()

    if (persist) {
      db.skills.save(normalized.id, 'skill', this.serializableSkill(normalized)).catch(() => {})
    }

    return normalized
  }

  async install(skill: SkillDefinition): Promise<void> {
    const installed = await this.registerSkill({ ...skill, origin: skill.origin ?? 'marketplace', marketplaceState: 'installed' })
    installed.marketplaceState = 'installed'
    installed.enabled = true
    this.skills.set(installed.id, installed)
    this.persistCatalog()
  }

  enable(skillId: string): void {
    const skill = this.skills.get(skillId)
    if (!skill) return
    skill.enabled = true
    skill.marketplaceState = 'installed'
    this.skills.set(skillId, skill)
    this.persistCatalog()
  }

  disable(skillId: string): void {
    const skill = this.skills.get(skillId)
    if (!skill) return
    skill.enabled = false
    skill.marketplaceState = 'disabled'
    this.skills.set(skillId, skill)
    this.persistCatalog()
  }

  async execute(
    skillOrQuery: string,
    input: SkillInput,
    context: SkillExecutionContext = {},
  ): Promise<SkillResult> {
    await this.ensureReady()
    const skill = this.resolve(skillOrQuery)
    if (!skill) {
      return {
        success: false,
        message: `No skill matched "${skillOrQuery}".`,
      }
    }

    if (skill.enabled === false) {
      return {
        success: false,
        message: `Skill "${skill.name}" is disabled.`,
      }
    }

    const runtimeApi = this.buildRuntimeApi()
    const handler = skill.handler ?? (skill.sourceCode ? skillSandboxExecutor.compile(skill.sourceCode).handler : undefined)
    if (!handler) {
      return {
        success: false,
        message: `Skill "${skill.name}" has no executable handler.`,
      }
    }

    const result = await skillSandboxExecutor.executeWithTimeout(handler, input, context, runtimeApi)
    skill.lastUsedAt = new Date().toISOString()
    skill.usageCount = (skill.usageCount ?? 0) + 1
    this.skills.set(skill.id, skill)
    this.persistCatalog()
    db.skills.save(skill.id, 'skill', this.serializableSkill(skill)).catch(() => {})

    return result
  }

  async executeBestMatch(
    command: string,
    input: SkillInput,
    context: SkillExecutionContext = {},
  ): Promise<SkillResult | null> {
    const skill = await this.findBestSkill(command)
    if (!skill) return null
    return this.execute(skill.id, input, context)
  }

  resolve(identifier: string): SkillDefinition | null {
    const normalized = identifier.trim().toLowerCase()
    if (!normalized) return null

    const direct = this.skills.get(identifier) ?? Array.from(this.skills.values()).find((skill) => skill.id.toLowerCase() === normalized)
    if (direct) return direct

    const aliasMatch = Array.from(this.skills.values()).find((skill) => {
      const haystack = [skill.name, skill.id, ...(skill.aliases ?? []), ...(skill.tags ?? [])].join(' ').toLowerCase()
      return haystack.includes(normalized)
    })

    return aliasMatch ?? null
  }

  getRuntimeApi(): SkillRuntimeApi {
    return this.buildRuntimeApi()
  }

  private buildRuntimeApi(): SkillRuntimeApi {
    const engine = this
    return {
      launchApp: async (appName, options) => {
        const result = await launchOrchestrator.launchApp(appName, options ?? {})
        return { success: result.success, message: result.message }
      },
      openExternal: async (url) => researchEngine.openExternal(url),
      research: {
        researchTopic: async (topic, options) => {
          const result = await researchEngine.researchTopic(topic, options)
          return {
            success: true,
            summary: result.summary,
            sources: result.sources,
          }
        },
        summarizeText: async (text, topic) => researchEngine.summarizeText(text, topic),
      },
      memory: {
        rememberFact: async (key, value, type) => memoryEngine.rememberFact(key, value, type),
        searchMemories: (query, limit) => memoryEngine.searchMemories(query, limit),
        listMemories: (limit) => memoryEngine.listMemories(limit),
      },
      search: {
        add: async (entry) => semanticSearchEngine.add(entry),
        search: async (query, topK) => {
          const result = await semanticSearchEngine.search(query, topK)
          return { confidence: result.confidence, usedLocal: result.usedLocal }
        },
        answer: async (question) => semanticSearchEngine.answer(question),
      },
      marketplace: {
        search: (query) => {
          return Array.from(engine.skills.values())
            .filter((skill) => skill.enabled !== false)
            .map((skill) => {
              const haystack = [skill.id, skill.name, skill.description, ...(skill.tags ?? []), ...(skill.aliases ?? [])]
                .join(' ')
                .toLowerCase()
              const normalized = query.trim().toLowerCase()
              let score = 0
              if (haystack.includes(normalized)) score += 2
              for (const token of normalized.split(/\s+/).filter(Boolean)) {
                if (haystack.includes(token)) score += 0.5
              }
              return {
                id: skill.id,
                name: skill.name,
                description: skill.description,
                category: skill.category,
                origin: skill.origin ?? 'generated',
                enabled: skill.enabled !== false,
                score: Math.min(1, score / 4),
                tags: skill.tags ?? [],
                aliases: skill.aliases ?? [],
              }
            })
            .filter((skill) => skill.score > 0)
            .sort((a, b) => b.score - a.score)
        },
        list: () => Array.from(engine.skills.values()),
        install: async (skill) => {
          await engine.install(skill)
        },
        enable: (skillId) => engine.enable(skillId),
        disable: (skillId) => engine.disable(skillId),
      },
    }
  }

  private readPersistedSkills(): SkillDefinition[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return []
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as SkillDefinition[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private persistCatalog(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return
      const serializable = Array.from(this.skills.values()).map((skill) => this.serializableSkill(skill))
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
    } catch {
      // Ignore storage failures; the in-memory catalog still works.
    }
  }

  private serializableSkill(skill: SkillDefinition): SkillDefinition {
    const { handler, ...rest } = skill
    return rest
  }
}

export const skillEngine = new SkillEngine()
