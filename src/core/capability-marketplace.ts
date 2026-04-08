import { skillEngine } from './skill-engine'
import { SkillDefinition, SkillSearchResult } from './skills/types'

class CapabilityMarketplace {
  async list(): Promise<SkillDefinition[]> {
    return skillEngine.listSkills()
  }

  search(query: string): SkillSearchResult[] {
    return skillEngine.getRuntimeApi().marketplace.search(query)
  }

  async install(skill: SkillDefinition): Promise<void> {
    await skillEngine.install(skill)
  }

  enable(skillId: string): void {
    skillEngine.enable(skillId)
  }

  disable(skillId: string): void {
    skillEngine.disable(skillId)
  }
}

export const capabilityMarketplace = new CapabilityMarketplace()
