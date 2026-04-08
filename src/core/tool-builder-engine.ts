import { mutationSandboxExecutor } from './mutation/sandbox-executor'
import { MutationManifest } from './mutation/types'
import { researchEngine } from './research-engine'
import { skillSandboxExecutor } from './skill-sandbox'
import { skillEngine } from './skill-engine'
import { SkillDefinition, SkillExecutionContext, SkillInput, SkillResult } from './skills/types'

export interface ToolBuildRequest {
  command: string
  topic?: string
  userTag?: string
  context?: SkillExecutionContext
}

export interface ToolBuildResult {
  skill: SkillDefinition
  manifest: MutationManifest
  validation: {
    mutation: boolean
    sandbox: boolean
    error?: string
  }
  registered: boolean
  execution?: SkillResult
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `tool-${Date.now()}`
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function inferBuildIntent(command: string): { category: SkillDefinition['category']; description: string; sourceCode: string; name: string; tags: string[] } {
  const lower = command.toLowerCase()

  if (/(summarize|digest|brief|document|article|paper)/.test(lower)) {
    return {
      category: 'research',
      name: 'Summarize Research Source',
      description: 'Summarizes a text block or research source into a concise brief.',
      tags: ['summarize', 'research', 'document'],
      sourceCode: [
        "const payload = typeof input === 'string' ? { text: input } : (input || {});",
        "const text = String(payload.text || payload.document || payload.content || payload.query || '').trim();",
        "if (!text) return { success: false, message: 'No text provided.' };",
        "const result = await api.research.summarizeText(text, String(payload.topic || 'generated skill'));",
        "return { success: true, message: result.summary, data: { highlights: result.highlights } };",
      ].join('\n'),
    }
  }

  if (/(open|launch|start|bring up)/.test(lower)) {
    return {
      category: 'automation',
      name: 'Launch Target Application',
      description: 'Launches an application based on the generated task request.',
      tags: ['launch', 'open', 'application'],
      sourceCode: [
        "const payload = typeof input === 'string' ? { app: input } : (input || {});",
        "const appName = String(payload.app || payload.appName || payload.target || payload.name || '').trim();",
        "if (!appName) return { success: false, message: 'No app name provided.' };",
        "const result = await api.launchApp(appName, { sensitiveOperation: Boolean(payload.sensitiveOperation) });",
        "return { success: result.success, message: result.message, data: { appName } };",
      ].join('\n'),
    }
  }

  if (/(email|mail|send message|compose|reply)/.test(lower)) {
    return {
      category: 'communication',
      name: 'Compose Email Draft',
      description: 'Creates a mail draft and opens it in the default mail client.',
      tags: ['email', 'compose', 'message'],
      sourceCode: [
        "const payload = typeof input === 'string' ? { message: input } : (input || {});",
        "const recipient = String(payload.to || payload.recipient || '').trim();",
        "const subject = String(payload.subject || 'Message from Jarvis').trim();",
        "const body = String(payload.body || payload.message || '').trim();",
        "if (!recipient) return { success: false, message: 'No recipient provided.' };",
        "const url = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;",
        "const result = await api.openExternal(url);",
        "return { success: result.success, message: result.message || `Opened draft for ${recipient}.`, data: { recipient, subject } };",
      ].join('\n'),
    }
  }

  return {
    category: 'generated',
    name: titleCase(command.slice(0, 42) || 'Generated Capability'),
    description: `Generated capability for: ${command}`,
    tags: command.split(/\s+/).filter((word) => word.length > 3).slice(0, 8),
    sourceCode: [
      "const payload = typeof input === 'string' ? { query: input } : (input || {});",
      "const query = String(payload.query || payload.text || payload.topic || payload.command || '').trim();",
      "if (!query) return { success: false, message: 'No task input was provided.' };",
      "const research = await api.research.researchTopic(query, { sourceHint: 'generated-tool' });",
      "return { success: true, message: research.summary, data: { sources: research.sources, query } };",
    ].join('\n'),
  }
}

class ToolBuilderEngine {
  async buildFromRequest(request: ToolBuildRequest): Promise<ToolBuildResult> {
    const intent = inferBuildIntent(request.command)
    const skillId = `generated.${slugify(intent.name)}`
    const research = await researchEngine.researchTopic(request.topic || request.command, {
      sourceHint: 'tool-builder',
      maxSources: 4,
    })

    const skill: SkillDefinition = {
      id: skillId,
      name: intent.name,
      description: `${intent.description} Built from: ${request.command}`,
      category: intent.category,
      tags: Array.from(new Set([...intent.tags, ...(request.command.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6))])),
      aliases: [request.command.slice(0, 40).toLowerCase()],
      version: '1.0.0',
      origin: 'generated',
      enabled: true,
      permissions: ['semantic_search', 'memory_write'],
      sourceCode: intent.sourceCode,
      metadata: {
        generatedFrom: request.command,
        researchSummary: research.summary,
        sources: research.sources,
      },
    }

    const manifest: MutationManifest = {
      id: `mutation-${skillId}-${Date.now()}`,
      title: `Generate skill: ${skill.name}`,
      createdAt: Date.now(),
      requestedBy: request.userTag || 'user',
      ownerProtocol: 'jarvis.tool-builder',
      capabilities: [skill.name, skill.category, ...(skill.tags ?? [])],
      dataAccessScope: ['memory', 'task'],
      sideEffects: ['register-skill', 'persist-registry-entry'],
      targetFiles: [],
      dependencyGraph: [],
      rollbackPlan: 'Disable generated skill and remove it from the catalog.',
      risk: 'medium',
      disableSwitch: true,
      immutableBoundaryTouched: false,
      stage: 'proposed',
    }

    const mutationValidation = await mutationSandboxExecutor.run(manifest)
    if (!mutationValidation.ok) {
      return {
        skill,
        manifest,
        validation: {
          mutation: false,
          sandbox: false,
          error: mutationValidation.error,
        },
        registered: false,
      }
    }

    const sandboxCheck = await skillSandboxExecutor.run(
      skill.sourceCode || '',
      { query: request.command } as SkillInput,
      request.context || {},
      skillEngine.getRuntimeApi(),
    )

    const sandboxOk = sandboxCheck.success
    if (!sandboxOk) {
      return {
        skill,
        manifest,
        validation: {
          mutation: true,
          sandbox: false,
          error: sandboxCheck.message,
        },
        registered: false,
      }
    }

    const registeredSkill = await skillEngine.registerSkill(skill)
    const execution = await skillEngine.execute(registeredSkill.id, { query: request.command }, request.context || {})

    return {
      skill: registeredSkill,
      manifest,
      validation: {
        mutation: true,
        sandbox: true,
      },
      registered: true,
      execution,
    }
  }

  async buildAndExecute(command: string, context: SkillExecutionContext = {}): Promise<SkillResult> {
    const result = await this.buildFromRequest({ command, context })
    if (!result.registered || !result.execution) {
      return {
        success: false,
        message: result.validation.error || 'Unable to build a new capability for this request.',
      }
    }

    return result.execution
  }
}

export const toolBuilderEngine = new ToolBuilderEngine()
