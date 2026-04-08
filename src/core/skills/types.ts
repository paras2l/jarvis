export type SkillCategory =
  | 'automation'
  | 'analysis'
  | 'communication'
  | 'research'
  | 'productivity'
  | 'system'
  | 'generated'
  | 'general'

export type SkillOrigin = 'builtin' | 'generated' | 'marketplace' | 'learned'

export type SkillInput = string | number | boolean | Record<string, unknown> | null | undefined

export interface SkillExecutionContext {
  userTag?: string
  platform?: string
  source?: string
  command?: string
  metadata?: Record<string, unknown>
}

export interface SkillResult {
  success: boolean
  message: string
  data?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface SkillSearchResult {
  id: string
  name: string
  description: string
  category: SkillCategory
  origin: SkillOrigin
  enabled: boolean
  score: number
  tags: string[]
  aliases: string[]
}

export interface SkillDefinition {
  id: string
  name: string
  description: string
  category: SkillCategory
  tags?: string[]
  aliases?: string[]
  version?: string
  enabled?: boolean
  origin?: SkillOrigin
  sourceCode?: string
  handler?: SkillHandler
  entryPoint?: string
  permissions?: string[]
  installedAt?: string
  lastUsedAt?: string
  usageCount?: number
  marketplaceState?: 'available' | 'installed' | 'disabled'
  metadata?: Record<string, unknown>
}

export interface SkillRuntimeApi {
  launchApp: (appName: string, options?: Record<string, unknown>) => Promise<{ success: boolean; message: string }>
  openExternal: (url: string) => Promise<{ success: boolean; message: string }>
  research: {
    researchTopic: (topic: string, options?: Record<string, unknown>) => Promise<{ success: boolean; summary: string; sources: Array<{ title: string; url?: string; excerpt?: string }> }>
    summarizeText: (text: string, topic?: string) => Promise<{ success: boolean; summary: string; highlights: string[] }>
  }
  memory: {
    rememberFact: (key: string, value: string, type?: 'habit' | 'preference' | 'fact' | 'goal' | 'mood_pattern') => Promise<void>
    searchMemories: (query: string, limit?: number) => Array<{ key: string; value: string }>
    listMemories: (limit?: number) => Array<{ key: string; value: string }>
  }
  search: {
    add: (entry: { content: string; summary: string; source: string; topic: string }) => Promise<string>
    search: (query: string, topK?: number) => Promise<{ confidence: number; usedLocal: boolean }>
    answer: (question: string) => Promise<{ answer: string; confidence: number } | null>
  }
  marketplace: {
    search: (query: string) => SkillSearchResult[]
    list: () => SkillDefinition[]
    install: (skill: SkillDefinition) => Promise<void>
    enable: (skillId: string) => void
    disable: (skillId: string) => void
  }
}

export type SkillHandler = (
  input: SkillInput,
  context: SkillExecutionContext,
  api: SkillRuntimeApi,
) => Promise<SkillResult> | SkillResult
