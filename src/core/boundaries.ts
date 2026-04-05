/**
 * Boundaries
 * Safety constraints and limitations for agent execution
 */

export interface ExecutionBoundary {
  name: string
  check: (context: ExecutionContext) => boolean
}

export interface ExecutionContext {
  userId: string
  action: string
  resource?: string
  parameters?: Record<string, unknown>
}

class BoundaryManager {
  private boundaries: Map<string, ExecutionBoundary> = new Map()

  constructor() {
    this.initializeDefaultBoundaries()
  }

  /**
   * Initialize default safety boundaries
   */
  private initializeDefaultBoundaries(): void {
    // System file protection
    this.addBoundary('protect-system-files', (context) => {
      if (context.action === 'delete' && context.resource) {
        const protectedPaths = ['/System', '/Windows', '/etc', '/usr/bin']
        return !protectedPaths.some((path) =>
          context.resource?.includes(path)
        )
      }
      return true
    })

    // Personal data protection
    this.addBoundary('protect-personal-data', (context) => {
      const sensitiveResources = ['passwords', 'ssn', 'credit_card']
      if (context.action === 'read' && context.resource) {
        return !sensitiveResources.some((resource) =>
          context.resource?.toLowerCase().includes(resource)
        )
      }
      return true
    })

    // Rate limiting
    this.addBoundary('rate-limit', (_context) => {
      // Implement rate limiting logic here
      return true
    })

    // Permission-based boundaries
    this.addBoundary('permission-check', (context) => {
      const allowedActions = [
        'app_launch',
        'send_message',
        'voice_command',
        'query_knowledge',
      ]
      return allowedActions.includes(context.action)
    })
  }

  /**
   * Add custom boundary
   */
  addBoundary(name: string, check: (context: ExecutionContext) => boolean): void {
    this.boundaries.set(name, { name, check })
  }

  /**
   * Check if action is allowed
   */
  isActionAllowed(context: ExecutionContext): boolean {
    for (const boundary of this.boundaries.values()) {
      if (!boundary.check(context)) {
        return false
      }
    }
    return true
  }

  /**
   * Get failed boundaries
   */
  checkBoundaries(context: ExecutionContext): string[] {
    const failed: string[] = []

    for (const boundary of this.boundaries.values()) {
      if (!boundary.check(context)) {
        failed.push(boundary.name)
      }
    }

    return failed
  }

  /**
   * Get all boundaries
   */
  getBoundaries(): ExecutionBoundary[] {
    return Array.from(this.boundaries.values())
  }
}

export default new BoundaryManager()
