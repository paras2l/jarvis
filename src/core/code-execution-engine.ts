/**
 * Code Execution Engine — The Self-Coding Brain
 *
 * Allows the agent to write, read, and execute code DIRECTLY on disk
 * without clicking any UI. No VS Code subscription required.
 *
 * When the user says "build me a React website":
 *   1. The LLM generates the full project code
 *   2. This engine writes every file directly to disk via IPC
 *   3. Runs `npm install` + `npm run dev` via terminal IPC
 *   4. Opens VS Code just to SHOW the result (optional)
 *
 * The agent is now a self-contained coding entity.
 */

import apiGateway from './api-gateway';
import { executionMemory, ActionStep } from './learning/execution-memory';
import { vibeWorkspace } from './vibe-workspace';
import { platformAdapter } from './platform-adapter';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CodeFile {
  path: string;          // Relative path, e.g. "src/App.tsx"
  content: string;       // Full file content
  language: string;      // "typescript" | "javascript" | "css" | "html" | etc.
}

export interface ProjectSpec {
  name: string;
  projectPath: string;   // Absolute output path on disk
  framework: string;     // "react" | "nextjs" | "vanilla" | "electron" | etc.
  description: string;
  files: CodeFile[];
  setupCommands: string[];   // e.g. ["npm install", "npm run dev"]
}

export interface CodingResult {
  success: boolean;
  projectPath?: string;
  filesWritten: number;
  message: string;
}

// ── Coding Knowledge Profile ─────────────────────────────────────────────

interface CodingKnowledge {
  languages: string[];
  frameworks: string[];
  patterns: string[];
  bestPractices: string[];
  loadedAt: string;
}

// ── CodeExecutionEngine ───────────────────────────────────────────────────

class CodeExecutionEngine {
  private codingKnowledge: CodingKnowledge | null = null;
  private readonly KNOWLEDGE_KEY = 'omni_coding_knowledge';

  constructor() {
    this.loadCodingKnowledge();
  }

  // ──────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Main entry point: given a natural language request, generate and write
   * a full working project to disk, then bring it alive inside VS Code.
   *
   * Flow:
   *   1. Generate all project files with 1 LLM call
   *   2. Write files directly to disk (fast, reliable)
   *   3. Open VS Code on the project folder
   *      → Extensions auto-activate: ESLint, Prettier, TypeScript, etc.
   *   4. Run setup commands INSIDE VS Code's integrated terminal
   *      → VS Code formats & flags errors in real-time
   *   5. Cache the playbook for instant future replay
   */
  async buildProject(userRequest: string, outputDir?: string): Promise<CodingResult> {
    console.log(`\n💻 [CodeEngine] Build request: "${userRequest}"`);

    const targetDir = outputDir || this.getDefaultOutputDir(userRequest);
    vibeWorkspace.setProjectRoot(targetDir);

    // 1. Generate the full project spec with 1 API call
    //    Pre-scan if existing project — for "Vibe Coding" refactors
    await vibeWorkspace.scanProject();
    const spec = await this.generateProjectSpec(userRequest, targetDir);
    if (!spec) {
      return { success: false, filesWritten: 0, message: 'Failed to generate project specification.' };
    }

    // 2. Write all files directly to disk
    const writeResult = await this.writeProjectToDisk(spec);
    if (!writeResult.success) return writeResult;

    // 3. Open VS Code on the project folder first
    await this.openInVSCode(spec.projectPath);

    // 4. Run setup commands with AUTONOMOUS FIX LOOP
    await this.runCommandsWithFixLoop(spec.setupCommands, spec.projectPath);

    // 5. Save playbook for instant future replay
    const steps: ActionStep[] = spec.files.map(f => ({
      type: 'type' as const,
      text: f.content,
      reasoning: `Write ${f.path}`,
    }));
    executionMemory.savePlaybook('code', userRequest, steps);

    return {
      success: true,
      projectPath: spec.projectPath,
      filesWritten: spec.files.length,
      message: `✅ Project "${spec.name}" is live in VS Code at ${spec.projectPath}`,
    };
  }

  /**
   * Autonomous Fix Loop (The "Vibe" Brain)
   * 
   * If a build command fails, the agent:
   *   1. Reads the error log
   *   2. Scans the local files
   *   3. Generates a fix
   *   4. Retries the command (up to 3 times)
   */
  async runCommandsWithFixLoop(commands: string[], cwd: string, retryCount = 0): Promise<boolean> {
    if (retryCount > 3) {
      console.warn(`[CodeEngine] 🔴 Fix loop exhausted after ${retryCount} retries.`);
      return false;
    }

    for (const cmd of commands) {
      console.log(`[CodeEngine] Running: ${cmd} (fix-loop: ${retryCount})`);
      const result = await platformAdapter.runCommand(cmd, cwd);
      
      if (!result.success) {
        console.log(`[CodeEngine] ⚠️ Command failed. Analyzing error...`);
        const fix = await this.generateFixForError(result.error || result.output, cmd);
        if (fix) {
          await this.applyFix(fix, cwd);
          return this.runCommandsWithFixLoop([cmd], cwd, retryCount + 1);
        }
      }
    }
    return true;
  }

  private async generateFixForError(error: string, cmd: string): Promise<any> {
    console.log(`🧠 [CodeEngine] Generating fix for building error...`);
    const prompt = `You are an Autonomous Senior Developer. 
Error during "${cmd}":
${error}

Analyze the error and propose a file fix. Return ONLY valid JSON:
{
  "filePath": "src/components/Broken.tsx",
  "newContent": "// fixed content here"
}`;
    const response = await apiGateway.queryKnowledge(prompt);
    if (response && (response as any).data?.content) {
      const raw = (response as any).data.content;
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(clean);
    }
    return null;
  }

  private async applyFix(fix: { filePath: string, newContent: string }, cwd: string) {
    const absolutePath = `${cwd}/${fix.filePath}`.replace(/\\/g, '/');
    await this.writeFile(absolutePath, fix.newContent);
    console.log(`✅ [CodeEngine] Fix applied to ${fix.filePath}`);
  }

  /**
   * Write or modify a single file. Used for "edit this file" or
   * "fix this bug" type requests.
   */
  async writeFile(absolutePath: string, content: string): Promise<boolean> {
    if (!window.nativeBridge?.writeFile) return false;
    const result = await window.nativeBridge.writeFile(absolutePath, content);
    console.log(`[CodeEngine] Written: ${absolutePath} → ${result.success}`);
    return result.success;
  }

  /**
   * Read a file from disk. Used for "review this code" or "fix this bug".
   */
  async readFile(absolutePath: string): Promise<string | null> {
    if (!window.nativeBridge?.readFile) return null;
    const result = await window.nativeBridge.readFile(absolutePath);
    return result.success ? result.content ?? null : null;
  }

  /**
   * Execute a shell command (npm install, git commit, python script, etc.)
   * Returns the stdout output.
   */
  async runCommand(command: string, cwd?: string): Promise<string> {
    console.log(`[CodeEngine] $ ${command}`);
    const result = await platformAdapter.runCommand(command, cwd ? { cwd } : undefined);
    return result.output || result.error || '';
  }

  /**
   * Learn coding deeply — pull programming knowledge into memory
   * from all learning channels simultaneously.
   */
  async learnCoding(language: string): Promise<void> {
    console.log(`📚 [CodeEngine] Learning ${language} from all sources...`);

    const prompt = `You are a Master Coding Knowledge Agent.
Compile the most important professional knowledge about: "${language}"
Return ONLY valid JSON:
{
  "languages": ["${language}", "related languages..."],
  "frameworks": ["popular frameworks for ${language}"],
  "patterns": ["design pattern 1", "pattern 2", "pattern 3"],
  "bestPractices": ["practice 1", "practice 2", "practice 3", "practice 4", "practice 5"]
}`;

    try {
      const response = await apiGateway.queryKnowledge(prompt);
      if (response && typeof response === 'object' && 'data' in (response as any)) {
        const raw = (response as any).data?.content || '{}';
        const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
        const knowledge = JSON.parse(clean) as CodingKnowledge;
        knowledge.loadedAt = new Date().toISOString();
        this.codingKnowledge = knowledge;
        localStorage.setItem(this.KNOWLEDGE_KEY, JSON.stringify(knowledge));
        console.log(`✅ [CodeEngine] Coding knowledge acquired: ${language}`);
      }
    } catch (e) {
      console.error('[CodeEngine] Failed to learn coding:', e);
    }
  }

  getCodingKnowledge(): CodingKnowledge | null {
    return this.codingKnowledge;
  }

  // ──────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────────────────────────────

  private async generateProjectSpec(userRequest: string, targetDir: string): Promise<ProjectSpec | null> {
    const knowledgeContext = this.codingKnowledge
      ? `Known patterns: ${this.codingKnowledge.patterns.join(', ')}. Best practices: ${this.codingKnowledge.bestPractices.join(', ')}.`
      : 'Use modern best practices.';

    const prompt = `You are a Master Full-Stack Developer Agent. 
User Request: "${userRequest}"
Output Directory: "${targetDir}"
${knowledgeContext}

Generate a complete, production-ready project. Return ONLY valid JSON:
{
  "name": "project-name",
  "projectPath": "${targetDir}",
  "framework": "react|nextjs|vanilla|node|etc",
  "description": "What this project does",
  "setupCommands": ["npm install", "npm run dev"],
  "files": [
    {
      "path": "package.json",
      "language": "json",
      "content": "{ ... complete file content ... }"
    },
    {
      "path": "src/App.tsx",
      "language": "typescript",
      "content": "// complete file content"
    }
  ]
}

Generate ALL necessary files for a fully working project. Include package.json, index.html, main source files. Make it actually run.`;

    try {
      const response = await apiGateway.queryKnowledge(prompt);
      if (response && typeof response === 'object' && 'data' in (response as any)) {
        const raw = (response as any).data?.content || '{}';
        const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
        const spec = JSON.parse(clean) as ProjectSpec;
        console.log(`[CodeEngine] Spec generated: ${spec.files?.length ?? 0} files for "${spec.name}"`);
        return spec;
      }
    } catch (e) {
      console.error('[CodeEngine] Failed to generate project spec:', e);
    }
    return null;
  }

  private async writeProjectToDisk(spec: ProjectSpec): Promise<CodingResult> {
    if (!window.nativeBridge?.writeFile) {
      return { success: false, filesWritten: 0, message: 'File writing not available in this environment.' };
    }

    let written = 0;
    for (const file of spec.files) {
      const absolutePath = `${spec.projectPath}/${file.path}`.replace(/\\/g, '/');
      const result = await window.nativeBridge.writeFile(absolutePath, file.content);
      if (result.success) {
        written++;
        console.log(`  ✅ Written: ${file.path}`);
      } else {
        console.warn(`  ⚠️ Failed: ${file.path} → ${result.message}`);
      }
    }

    return {
      success: written > 0,
      filesWritten: written,
      projectPath: spec.projectPath,
      message: `Written ${written}/${spec.files.length} files.`,
    };
  }

  /**
   * Open VS Code on a folder — this is where extensions like ESLint,
   * Prettier, TypeScript, GitHub Copilot etc. automatically activate.
   */
  private async openInVSCode(projectPath: string): Promise<void> {
    console.log(`[CodeEngine] 📂 Opening VS Code: ${projectPath}`);
    await platformAdapter.runCommand(`code "${projectPath}"`);
  }


  private getDefaultOutputDir(request: string): string {
    const name = request
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(' ')
      .slice(0, 3)
      .join('-');
    return `C:/Users/Projects/${name}-${Date.now()}`;
  }

  private loadCodingKnowledge(): void {
    try {
      const stored = localStorage.getItem(this.KNOWLEDGE_KEY);
      if (stored) {
        this.codingKnowledge = JSON.parse(stored);
        console.log(`[CodeEngine] 🧠 Coding knowledge loaded from memory.`);
      }
    } catch (_) {
      // silent
    }
  }
}

export const codeExecutionEngine = new CodeExecutionEngine();
