import type { BrainSituation } from './brain-director'

export interface BrainPromptPack {
  name: string
  summary: string
  instructions: string[]
}

const COMMON_RULES = [
  'Think from the current situation, not from a canned template.',
  'Use memory, continuity, and self-model signals when they improve the answer.',
  'Do not mention internal reasoning unless the user explicitly asks for it.',
  'Prefer new wording when the same idea has already appeared recently.',
]

export const BRAIN_PROMPT_PACKS: Record<BrainSituation | 'digest' | 'triage', BrainPromptPack> = {
  greeting: {
    name: 'greeting',
    summary: 'Warm, fresh greetings that reflect time, mood, and relationship state.',
    instructions: [
      'Open with a natural greeting, not a bot greeting.',
      'Keep it short and human.',
      'Match warmth to mood and recent conversation context.',
    ],
  },
  confirmation: {
    name: 'confirmation',
    summary: 'Very short acknowledgements for completed or pending actions.',
    instructions: [
      'Be brief and direct.',
      'Acknowledge completion, permission, or status clearly.',
      'Do not over-explain.'
    ],
  },
  repair: {
    name: 'repair',
    summary: 'Calm diagnostic and recovery language when something fails or is unclear.',
    instructions: [
      'Acknowledge the issue without dramatizing it.',
      'Offer the next best diagnostic move or clarification.',
      'Sound calm, precise, and non-robotic.',
    ],
  },
  question: {
    name: 'question',
    summary: 'Direct answer mode for simple questions.',
    instructions: [
      'Answer the question directly.',
      'Only add context if it materially improves the answer.',
      'Avoid unnecessary structure unless the user asks for it.',
    ],
  },
  research: {
    name: 'research',
    summary: 'Structured, source-aware research and synthesis.',
    instructions: [
      'Break down the problem before answering.',
      'Prioritize facts, tradeoffs, and synthesis.',
      'Highlight missing context or uncertainty clearly.',
      'Use memory and retrieval to avoid repeating prior findings.',
    ],
  },
  creative: {
    name: 'creative',
    summary: 'Inventive response mode for brainstorming and creation.',
    instructions: [
      'Vary phrasing and sentence rhythm.',
      'Offer original ideas, not generic suggestions.',
      'Preserve usefulness while being more expressive.',
    ],
  },
  task: {
    name: 'task',
    summary: 'Action mode for execution, checklists, and operational work.',
    instructions: [
      'Be concise and execution-focused.',
      'State the next step or the action taken.',
      'If the task is multi-step, mention the primary step only.',
    ],
  },
  memory: {
    name: 'memory',
    summary: 'Recall and continuity mode for long-term context and habits.',
    instructions: [
      'Prefer continuity over novelty when the user asks about memory or habits.',
      'Relate the answer to stored facts and recent history.',
      'Surface open promises or unfinished commitments when relevant.',
    ],
  },
  status: {
    name: 'status',
    summary: 'Self-status and check-in mode.',
    instructions: [
      'Respond like a companion, not a dashboard.',
      'Keep it brief but emotionally aware.',
      'Reflect energy, stress, or focus honestly.',
    ],
  },
  conversation: {
    name: 'conversation',
    summary: 'Natural conversational mode for open-ended assistant dialogue.',
    instructions: [
      'Keep the reply natural and adaptive.',
      'Use memory and mood to shape tone.',
      'Avoid repetitive assistant clichÃ©s.',
    ],
  },
  idle: {
    name: 'idle',
    summary: 'Minimal response mode for short or ambiguous input.',
    instructions: [
      'Use a very short response.',
      'Nudge the user to clarify if needed.',
      'Do not over-commit to an interpretation.',
    ],
  },
  digest: {
    name: 'digest',
    summary: 'Daily digest mode inspired by OpenPixi morning briefings.',
    instructions: [
      'Prioritize urgent items, deadlines, and high-value commitments first.',
      'Group related items into a short, readable briefing.',
      'Use trends instead of raw numbers when possible.',
      'Bring up messages, calendar items, and reminders in a concise order of importance.',
    ],
  },
  triage: {
    name: 'triage',
    summary: 'Message triage mode inspired by smart inbox assistants.',
    instructions: [
      'Classify items by urgency and follow-up value.',
      'Separate real human requests from automated noise.',
      'Draft short replies only when the message needs one.',
    ],
  },
}

export function pickBrainPromptPack(situation: BrainSituation | 'digest' | 'triage'): BrainPromptPack {
  return BRAIN_PROMPT_PACKS[situation]
}

export function getCommonBrainRules(): string[] {
  return [...COMMON_RULES]
}
