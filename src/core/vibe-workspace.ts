/**
 * Vibe Workspace — Project Perception & Context Management
 *
 * This module allows the agent to "see" the entire project at once.
 */

export interface FileNode {
  path: string;
  isDir: boolean;
  size?: number;
  children?: FileNode[];
}

class VibeWorkspace {
  private projectRoot: string = '';
  private projectMap: FileNode[] = [];
  private activeFiles: Set<string> = new Set();

  setProjectRoot(path: string) {
    this.projectRoot = path.replace(/\\/g, '/');
    console.log(`📂 [VibeWorkspace] Root set to: ${this.projectRoot}`);
  }

  async scanProject(): Promise<FileNode[]> {
    const bridge = (window as any).nativeBridge;
    if (!this.projectRoot || !bridge?.readDir) return [];
    
    console.log(`🔍 [VibeWorkspace] Scanning project perception...`);
    try {
      const result = await bridge.readDir(this.projectRoot);
      if (result.success && result.files) {
        this.projectMap = result.files.map((f: any) => ({
          path: f.name,
          isDir: f.isDir,
          size: f.size
        }));
      }
      return this.projectMap;
    } catch (e) {
      console.error('[VibeWorkspace] Scan failed:', e);
      return [];
    }
  }

  async getContextForTask(query: string): Promise<string> {
    console.log(`🧠 [VibeWorkspace] Gathering context for: "${query}"`);
    return `Project Root: ${this.projectRoot}\nFiles: ${this.projectMap.length} detected.`;
  }

  trackFile(path: string) {
    this.activeFiles.add(path);
  }

  getActiveFiles(): string[] {
    return Array.from(this.activeFiles);
  }
}

export const vibeWorkspace = new VibeWorkspace();
