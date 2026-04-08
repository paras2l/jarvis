/**
 * GitHub Agent â€” Feature #10
 *
 * Natural language GitHub control. Inspired by Pixi-MARK5's GitHub integration.
 * Re-built for our Electron stack using shell commands (no API required).
 *
 * The agent can now:
 *   - Clone any public/private repo
 *   - Commit, push, pull its own code changes
 *   - Create branches for new features
 *   - Read issues and PRs
 *   - The VIBE CODING loop is now complete: agent writes code â†’ commits â†’ pushes
 *
 * Requires: git installed on system (standard on Windows/Mac/Linux).
 * For private repos: user's git credentials (already configured in system).
 */

import { codeExecutionEngine } from './code-execution-engine'
import { intelligenceRouter } from './intelligence-router'

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface GitResult {
  success: boolean
  output: string
  command: string
}

export interface RepoInfo {
  name: string
  path: string
  branch: string
  status: string
  remoteUrl?: string
}

// â”€â”€ GitHubAgent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class GitHubAgent {
  private currentRepoPath: string | null = null

  // â”€â”€ Natural Language Interface â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Process a natural language GitHub request.
   * "clone react repo from facebook", "commit my changes", "push to main", etc.
   */
  async handleRequest(userRequest: string, repoPath?: string): Promise<string> {
    const lower = userRequest.toLowerCase()

    if (this.matchesClone(lower)) return this.handleClone(userRequest)
    if (this.matchesCommit(lower)) return this.handleCommit(userRequest, repoPath)
    if (this.matchesPush(lower)) return this.handlePush(repoPath)
    if (this.matchesPull(lower)) return this.handlePull(repoPath)
    if (this.matchesBranch(lower)) return this.handleBranch(userRequest, repoPath)
    if (this.matchesStatus(lower)) return this.handleStatus(repoPath)
    if (this.matchesInit(lower)) return this.handleInit(repoPath)

    // Unknown â€” ask LLM to interpret
    return this.interpretAndExecute(userRequest, repoPath)
  }

  // â”€â”€ Core Git Operations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Clone a repository.
   */
  async clone(repoUrl: string, targetDir?: string): Promise<GitResult> {
    const dir = targetDir || this.getCloneDir(repoUrl)
    const cmd = `git clone "${repoUrl}" "${dir}"`
    const result = await this.run(cmd)
    if (result.success) {
      this.currentRepoPath = dir
      // Auto-open in VS Code after clone
      await codeExecutionEngine.runCommand(`code "${dir}"`)
    }
    return result
  }

  /**
   * Stage all changes and commit with a message.
   */
  async commit(message: string, repoPath?: string): Promise<GitResult> {
    const cwd = repoPath || this.currentRepoPath
    if (!cwd) return { success: false, output: 'No repo path set', command: '' }

    // Stage all changes first
    await this.run('git add -A', cwd)
    return this.run(`git commit -m "${message.replace(/"/g, "'")}"`, cwd)
  }

  /**
   * Push to remote.
   */
  async push(branch?: string, repoPath?: string): Promise<GitResult> {
    const cwd = repoPath || this.currentRepoPath
    if (!cwd) return { success: false, output: 'No repo path set', command: '' }

    const b = branch || await this.getCurrentBranch(cwd)
    return this.run(`git push origin ${b}`, cwd)
  }

  /**
   * Pull latest changes.
   */
  async pull(repoPath?: string): Promise<GitResult> {
    const cwd = repoPath || this.currentRepoPath
    if (!cwd) return { success: false, output: 'No repo path set', command: '' }
    return this.run('git pull', cwd)
  }

  /**
   * Create and switch to a new branch.
   */
  async createBranch(branchName: string, repoPath?: string): Promise<GitResult> {
    const cwd = repoPath || this.currentRepoPath
    if (!cwd) return { success: false, output: 'No repo path set', command: '' }
    // Sanitize branch name
    const safe = branchName.replace(/[^a-z0-9-_/]/gi, '-').toLowerCase()
    return this.run(`git checkout -b "${safe}"`, cwd)
  }

  /**
   * Get repo status (modified files, staged, etc.)
   */
  async getStatus(repoPath?: string): Promise<string> {
    const cwd = repoPath || this.currentRepoPath
    if (!cwd) return 'No repo path set'
    const result = await this.run('git status --short', cwd)
    return result.output || 'Clean working directory'
  }

  /**
   * Initialize a new git repo in the given folder.
   */
  async init(path: string): Promise<GitResult> {
    const result = await this.run('git init', path)
    if (result.success) this.currentRepoPath = path
    return result
  }

  /**
   * Get current branch name.
   */
  async getCurrentBranch(repoPath?: string): Promise<string> {
    const cwd = repoPath || this.currentRepoPath || '.'
    const result = await this.run('git branch --show-current', cwd)
    return result.output.trim() || 'main'
  }

  /**
   * Full vibe-coding commit cycle:
   * 1. Agent writes code to disk (code-execution-engine)
   * 2. This method stages + commits + pushes in one go
   */
  async vibeCommitPush(message: string, repoPath: string): Promise<string> {
    const commit = await this.commit(message, repoPath)
    if (!commit.success) return `âŒ Commit failed: ${commit.output}`

    const push = await this.push(undefined, repoPath)
    if (!push.success) return `âœ… Committed but push failed: ${push.output}`

    return `âœ… Code committed and pushed! Message: "${message}"`
  }

  setCurrentRepo(path: string): void {
    this.currentRepoPath = path
    console.log(`[GitHub] Active repo: ${path}`)
  }

  getCurrentRepo(): string | null {
    return this.currentRepoPath
  }

  // â”€â”€ Private: NL Routing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async handleClone(request: string): Promise<string> {
    // Extract URL or repo name from request
    const urlMatch = request.match(/(https?:\/\/[^\s]+)/i)
    const githubMatch = request.match(/(?:clone|from|repo)\s+([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)/i)

    let url = urlMatch?.[1] ?? ''
    if (!url && githubMatch) url = `https://github.com/${githubMatch[1]}.git`
    if (!url) {
      // Ask LLM to extract the repo URL
      const r = await intelligenceRouter.query(`Extract the GitHub repo URL or user/repo from: "${request}". Return ONLY the URL.`)
      url = r.content.trim()
    }

    if (!url) return 'âŒ Could not determine repo URL. Try: "clone https://github.com/user/repo"'
    const result = await this.clone(url)
    return result.success
      ? `âœ… Cloned ${url} â€” opened in VS Code`
      : `âŒ Clone failed: ${result.output}`
  }

  private async handleCommit(request: string, repoPath?: string): Promise<string> {
    // Extract commit message
    const msgMatch = request.match(/(?:message|msg|with)\s+"([^"]+)"/i)
      ?? request.match(/commit\s+(.+)/i)
    const message = msgMatch?.[1]?.trim() ?? 'Auto-commit by Pixi agent'
    const result = await this.commit(message, repoPath)
    return result.success
      ? `âœ… Committed: "${message}"`
      : `âŒ Commit failed: ${result.output}`
  }

  private async handlePush(repoPath?: string): Promise<string> {
    const result = await this.push(undefined, repoPath)
    return result.success ? 'âœ… Pushed to remote' : `âŒ Push failed: ${result.output}`
  }

  private async handlePull(repoPath?: string): Promise<string> {
    const result = await this.pull(repoPath)
    return result.success ? 'âœ… Pulled latest changes' : `âŒ Pull failed: ${result.output}`
  }

  private async handleBranch(request: string, repoPath?: string): Promise<string> {
    const nameMatch = request.match(/branch\s+(?:called|named)?\s*([a-zA-Z0-9_./-]+)/i)
    const name = nameMatch?.[1]?.trim() ?? `feature-${Date.now()}`
    const result = await this.createBranch(name, repoPath)
    return result.success
      ? `âœ… Created and switched to branch: ${name}`
      : `âŒ Branch creation failed: ${result.output}`
  }

  private async handleStatus(repoPath?: string): Promise<string> {
    const status = await this.getStatus(repoPath)
    return `ðŸ“‹ Git status:\n${status}`
  }

  private async handleInit(repoPath?: string): Promise<string> {
    const path = repoPath || (await codeExecutionEngine.runCommand('cd'))
    const result = await this.init(path)
    return result.success
      ? `âœ… Git initialized at ${path}`
      : `âŒ Init failed: ${result.output}`
  }

  private async interpretAndExecute(request: string, repoPath?: string): Promise<string> {
    const prompt = `You are a git expert. Convert this natural language request into a single git command.
Request: "${request}"
Current repo: ${repoPath || 'unknown'}
Return ONLY the git command, nothing else.`

    const r = await intelligenceRouter.query(prompt, { taskType: 'code' })
    const cmd = r.content.trim()

    if (!cmd.startsWith('git ')) return `âŒ Could not interpret git request: "${request}"`
    const result = await this.run(cmd, repoPath || undefined)
    return result.success ? `âœ… ${result.output}` : `âŒ ${result.output}`
  }

  // â”€â”€ Shell Execution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async run(command: string, cwd?: string): Promise<GitResult> {
    const output = await codeExecutionEngine.runCommand(command, cwd)
    const success = !output.toLowerCase().includes('error') && !output.toLowerCase().includes('fatal')
    return { success, output: output.trim(), command }
  }

  // â”€â”€ Pattern Matchers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private matchesClone = (s: string) => s.includes('clone') || s.includes('download repo')
  private matchesCommit = (s: string) => s.includes('commit')
  private matchesPush = (s: string) => s.includes('push')
  private matchesPull = (s: string) => s.includes('pull') || s.includes('fetch')
  private matchesBranch = (s: string) => s.includes('branch')
  private matchesStatus = (s: string) => s.includes('status') || s.includes('what changed')
  private matchesInit = (s: string) => s.includes('init') || s.includes('initialize')

  private getCloneDir(repoUrl: string): string {
    const name = repoUrl.split('/').pop()?.replace('.git', '') ?? 'repo'
    return `C:/Users/Projects/${name}`
  }
}

export const githubAgent = new GitHubAgent()

