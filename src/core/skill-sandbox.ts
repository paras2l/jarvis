import { SkillExecutionContext, SkillHandler, SkillInput, SkillResult } from './skills/types'

class SkillSandboxExecutor {
  compile(sourceCode: string): { ok: boolean; handler?: SkillHandler; error?: string } {
    try {
      const factory = new Function(
        'return async function skillHandler(input, context, api) {\n' +
          sourceCode +
          '\n}'
      ) as () => SkillHandler
      const handler = factory()
      return { ok: true, handler }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async run(
    sourceCode: string,
    input: SkillInput,
    context: SkillExecutionContext,
    api: Parameters<SkillHandler>[2],
    timeoutMs = 4_000,
  ): Promise<SkillResult> {
    const compiled = this.compile(sourceCode)
    if (!compiled.ok || !compiled.handler) {
      return {
        success: false,
        message: compiled.error || 'Failed to compile generated skill.',
      }
    }

    return this.executeWithTimeout(compiled.handler, input, context, api, timeoutMs)
  }

  async executeWithTimeout(
    handler: SkillHandler,
    input: SkillInput,
    context: SkillExecutionContext,
    api: Parameters<SkillHandler>[2],
    timeoutMs = 4_000,
  ): Promise<SkillResult> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined

    try {
      return await Promise.race([
        Promise.resolve(handler(input, context, api)),
        new Promise<SkillResult>((_, reject) => {
          timeoutHandle = globalThis.setTimeout(() => {
            reject(new Error(`Skill execution timed out after ${timeoutMs}ms`))
          }, timeoutMs)
        }),
      ])
    } finally {
      if (timeoutHandle !== undefined) {
        globalThis.clearTimeout(timeoutHandle)
      }
    }
  }
}

export const skillSandboxExecutor = new SkillSandboxExecutor()
