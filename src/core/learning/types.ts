export interface AppShortcut {
  actionDescription: string;
  keyCombo: string;
  context?: string; // e.g. "Object Mode", "Global"
}

export interface AppUIMap {
  panelName: string;
  estimatedPosition: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'floating';
  containsElements: string[];
}

export interface AppSkillProfile {
  appName: string;
  lastUpdated: string;
  version?: string;
  shortcuts: AppShortcut[];
  uiMap: AppUIMap[];
  coreParadigms: string[];
  creativeWorkflows: string[];
  generalInstructions: string;
}

export type LearningQuestStatus = 'queued' | 'in-progress' | 'completed' | 'failed';

export interface LearningQuest {
  id: string;
  appName: string;
  status: LearningQuestStatus;
  queuedAt: number;
  scheduledTime?: number; // For overnight execution
}

export interface WebSubagentResult {
  shortcuts: AppShortcut[];
  rawSummary: string;
}

export interface VideoSubagentResult {
  uiMaps: AppUIMap[];
  visualNotes: string;
  coreParadigms: string[];
  creativeWorkflows: string[];
}

export interface BookSubagentResult {
  coreParadigms: string[];
  creativeWorkflows: string[];
  bookSource: string;
}
