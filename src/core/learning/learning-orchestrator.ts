import { LearningQuest, AppSkillProfile } from './types';
import { WebSubagent } from './web-subagent';
import { VideoSubagent } from './video-subagent';
import { BookSubagent } from './book-subagent';
import { SkillSynthesizer } from './skill-synthesizer';

export class LearningOrchestrator {
  private activeQuests: Map<string, LearningQuest> = new Map();
  private nightQueue: LearningQuest[] = [];

  /**
   * Start a learning mission dynamically or queue it for overnight processing.
   */
  public async scheduleQuest(appName: string, isOvernight: boolean = false): Promise<string> {
    const questId = `quest-${Date.now()}`;
    const quest: LearningQuest = {
      id: questId,
      appName,
      status: 'queued',
      queuedAt: Date.now()
    };

    if (isOvernight) {
      console.log(`[Orchestrator] Quest for ${appName} added to Overnight Queue.`);
      this.nightQueue.push(quest);
      return questId;
    }

    this.activeQuests.set(questId, quest);
    
    // Execute immediately in background instead of awaiting if we want non-blocking
    // but for demonstration, we will trigger it asynchronously
    this.executeQuest(quest).catch(err => {
      console.error(`[Orchestrator] Quest failed:`, err);
    });

    return questId;
  }

  private async executeQuest(quest: LearningQuest): Promise<AppSkillProfile> {
    quest.status = 'in-progress';
    const { appName } = quest;
    console.log(`[Orchestrator] Launching Multi-Agent Learning Quest for: ${appName}`);

    // STEP 1: Launch Web Researchers
    const webAgent1 = new WebSubagent(appName);
    
    // STEP 2: Find a tutorial and slice it (Mocked tutorial length 20 mins)
    const videoAgent1 = new VideoSubagent(appName, 'https://youtube.com/watch?v=mock', 0, 300);
    const videoAgent2 = new VideoSubagent(appName, 'https://youtube.com/watch?v=mock', 300, 600);
    const bookAgent = new BookSubagent(`${appName} manual tutorial theory`);

    console.log(`[LearningOrchestrator] Quest mapped. Spawning Web, Book, and Video agents...`);

    const results = await Promise.all([
      webAgent1.executeResearch(),
      videoAgent1.analyzeVideoChunk(),
      videoAgent2.analyzeVideoChunk(),
      bookAgent.readAndAnalyze()
    ]);

    const webResults = [results[0]];
    const videoResults = [results[1], results[2]];
    const bookResults = [results[3]];

    console.log(`[LearningOrchestrator] Quest tasks resolved. Handing down to SkillSynthesizer.`);
    const synthesizer = new SkillSynthesizer();
    const finalProfile = synthesizer.compileProfile(appName, webResults as any, videoResults as any, bookResults as any);

    await synthesizer.saveProfileToDisk(finalProfile);

    quest.status = 'completed';
    console.log(`[Orchestrator] Quest ${quest.id} for ${quest.appName} completed successfully.`);

    return finalProfile;
  }

  /**
   * Process the overnight queue sequentially (or parallel batched)
   */
  public async executeNightQueue() {
    console.log(`[Orchestrator] Waking up to process the night queue. Items: ${this.nightQueue.length}`);
    while (this.nightQueue.length > 0) {
      const quest = this.nightQueue.shift();
      if (quest) {
        await this.executeQuest(quest);
      }
    }
  }
}

export const learningOrchestrator = new LearningOrchestrator();
