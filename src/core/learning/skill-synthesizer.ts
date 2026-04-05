import { AppSkillProfile, WebSubagentResult, VideoSubagentResult, BookSubagentResult } from './types';

export class SkillSynthesizer {
  
  /**
   * Merges results from web and video subagents to compile a unified AppSkillProfile
   */
  public compileProfile(
    appName: string, 
    webResults: WebSubagentResult[], 
    videoResults: VideoSubagentResult[],
    bookResults: BookSubagentResult[]
  ): AppSkillProfile {
    console.log(`[Synthesizer] Compiling skill profile for ${appName}...`);

    // Merge shortcuts and deduplicate
    const aggregatedShortcuts = webResults.flatMap(r => r.shortcuts);
    
    // Merge UI maps
    const aggregatedUiMaps = videoResults.flatMap(r => r.uiMaps || []);
    
    // Merge core paradigms and workflows from both videos and books
    const videoParadigms = videoResults.flatMap(r => r.coreParadigms || []);
    const bookParadigms = bookResults.flatMap(r => r.coreParadigms || []);
    const aggregatedParadigms = [...videoParadigms, ...bookParadigms];

    const videoWorkflows = videoResults.flatMap(r => r.creativeWorkflows || []);
    const bookWorkflows = bookResults.flatMap(r => r.creativeWorkflows || []);
    const aggregatedWorkflows = [...videoWorkflows, ...bookWorkflows];

    const profile: AppSkillProfile = {
      appName,
      lastUpdated: new Date().toISOString(),
      shortcuts: aggregatedShortcuts,
      uiMap: aggregatedUiMaps,
      coreParadigms: aggregatedParadigms,
      creativeWorkflows: aggregatedWorkflows,
      generalInstructions: `Compiled knowledge context built recursively from ${webResults.length} web scrapes, ${videoResults.length} video chunks, and ${bookResults.length} book references.`
    };

    return profile;
  }

  /**
   * Commits the compiled profile to disk permanently via IPC.
   */
  public async saveProfileToDisk(profile: AppSkillProfile): Promise<boolean> {
    try {
      console.log(`[Synthesizer] 💾 Saving brain for ${profile.appName} to disk...`);
      if (window.nativeBridge?.saveSkill) {
        const result = await window.nativeBridge.saveSkill(profile.appName, profile);
        if (result.success) {
          console.log(`[Synthesizer] ✅ Skill saved: ${profile.appName}`);
          return true;
        }
        console.error(`[Synthesizer] Save failed: ${result.message}`);
      }
      return false;
    } catch (e) {
      console.error('[Synthesizer] Failed to save profile', e);
      return false;
    }
  }

  /**
   * Loads a cognitive profile for a specific app from disk.
   * Returns null if no skill has been learned yet.
   */
  public async loadProfileFromDisk(appName: string): Promise<AppSkillProfile | null> {
    console.log(`[Synthesizer] 🧠 Recalling memories for: ${appName}`);
    try {
      if (window.nativeBridge?.loadSkill) {
        const result = await window.nativeBridge.loadSkill(appName);
        if (result.success && result.profile) {
          console.log(`[Synthesizer] ✅ Brain loaded for ${appName}.`);
          return result.profile as AppSkillProfile;
        }
      }
    } catch (e) {
      console.error('[Synthesizer] Failed to load profile', e);
    }
    return null;
  }
}

export const skillSynthesizer = new SkillSynthesizer();
