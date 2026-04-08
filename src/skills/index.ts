import { analyzeStockChartSkill } from './analysis/analyze-stock-chart'
import { openApplicationSkill } from './automation/open-application'
import { sendEmailSkill } from './communication/send-email'
import { summarizeDocumentSkill } from './research/summarize-document'
import { SkillDefinition } from '@/core/skills/types'

export const builtinSkills: SkillDefinition[] = [
  openApplicationSkill,
  analyzeStockChartSkill,
  sendEmailSkill,
  summarizeDocumentSkill,
]
