/**
 * Script Generator (Phase 4)
 *
 * Generates professional scripts for digital human presentations:
 * - Converts high-level prompts into scene/dialogue breakdowns
 * - Supports templates: product pitch, tutorial, storytelling, news brief
 * - Outputs structured script with timing and speaker notes
 * - Fallback: lightweight local LLM or template-based generation
 */

export interface ScriptScene {
  sceneId: string
  sceneType: 'intro' | 'body' | 'call-to-action' | 'outro'
  speechText: string
  duration: number // estimated seconds
  cameraDirection?: 'face-camera' | 'looking-left' | 'looking-right' | 'full-body'
  motionPrompt?: string // for avatar animation
  notes?: string
}

export interface GeneratedScript {
  id: string
  title: string
  prompt: string
  scenes: ScriptScene[]
  totalDurationSeconds: number
  template: string
  generatedAt: string
}

import { platformAdapter } from '../platform-adapter'

const SCRIPT_TEMPLATES = {
  'product-pitch': {
    structure: ['intro', 'problem', 'solution', 'benefits', 'call-to-action', 'outro'],
    description: 'Product or service pitch presentation',
  },
  tutorial: {
    structure: ['intro', 'overview', 'steps', 'tips', 'summary', 'outro'],
    description: 'Step-by-step educational content',
  },
  storytelling: {
    structure: ['intro', 'setup', 'conflict', 'resolution', 'moral', 'outro'],
    description: 'Narrative or case study story',
  },
  'news-brief': {
    structure: ['headline', 'details', 'impact', 'outlook', 'outro'],
    description: 'News or announcement format',
  },
}

class ScriptGenerator {
  /**
   * Generate script from prompt using local LLM or template
   */
  async generateScript(
    prompt: string,
    template: keyof typeof SCRIPT_TEMPLATES = 'product-pitch'
  ): Promise<GeneratedScript> {
    // Try local LLM first
    const llmScript = await this.tryLocalLLMGeneration(prompt, template)
    if (llmScript) {
      return llmScript
    }

    // Fallback: template-based generation
    return this.generateFromTemplate(prompt, template)
  }

  /**
   * Try to use local LLM (if available via native bridge)
   */
  private async tryLocalLLMGeneration(
    prompt: string,
    template: string
  ): Promise<GeneratedScript | null> {
    try {
      if (typeof window === 'undefined') {
        return null
      }

      const pythonScript = `
import json
from pathlib import Path
try:
  # Try to load a lightweight local LLM (e.g., ollama, vLLM)
  # This is a placeholder - actual implementation depends on local setup
  
  prompt = "${prompt.replace(/"/g, '\\"')}"
  template = "${template}"
  
  # Would use: ollama run llama2 "Generate a {template} script about: {prompt}"
  # For now, return None to fallback to template-based
  print("NO_LLM")
except Exception as e:
  print(f"ERROR|{e}")
`

      const result = await platformAdapter.runCommand(`python -c "${pythonScript}"`)
      const output = result.output || ''
      if (output.includes('ERROR|') || output.includes('NO_LLM')) {
        return null
      }

      // Parse LLM output (would be JSON in real implementation)
      return null
    } catch {
      return null
    }
  }

  /**
   * Generate script using template-based rules
   */
  private generateFromTemplate(
    prompt: string,
    template: keyof typeof SCRIPT_TEMPLATES
  ): GeneratedScript {
    const id = `script-${Date.now()}`
    const templateConfig = SCRIPT_TEMPLATES[template] || SCRIPT_TEMPLATES['product-pitch']

    // Parse prompt for key information
    const keyPoints = this.extractKeyPoints(prompt)
    const scenes = this.buildScenes(keyPoints, templateConfig.structure)

    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0)

    return {
      id,
      title: this.generateTitle(prompt),
      prompt,
      scenes,
      totalDurationSeconds: totalDuration,
      template,
      generatedAt: new Date().toISOString(),
    }
  }

  /**
   * Extract key points from prompt using simple NLP
   */
  private extractKeyPoints(prompt: string): string[] {
    const points: string[] = []

    // Simple keyword extraction
    const sentences = prompt.split(/[.!?]+/).filter((s) => s.trim().length > 0)

    for (const sentence of sentences) {
      const trimmed = sentence.trim()
      if (trimmed.length > 20) {
        points.push(trimmed)
      }
    }

    return points.length > 0 ? points : [prompt]
  }

  /**
   * Build script scenes from key points and structure
   */
  private buildScenes(
    keyPoints: string[],
    structure: string[]
  ): ScriptScene[] {
    const scenes: ScriptScene[] = []
    const pointsPerSection = Math.ceil(keyPoints.length / structure.length)

    for (let i = 0; i < structure.length; i++) {
      const sceneType = structure[i] as any
      const sectionPoints = keyPoints.slice(i * pointsPerSection, (i + 1) * pointsPerSection)

      const speechText =
        sectionPoints.length > 0
          ? sectionPoints.join(' ')
          : this.getDefaultSpeech(sceneType as any)

      const scene: ScriptScene = {
        sceneId: `scene-${i}`,
        sceneType: sceneType as any,
        speechText,
        duration: Math.ceil(speechText.length / 50), // ~50 chars per second
        cameraDirection: this.getDefaultCameraDirection(sceneType as any),
        motionPrompt: this.getDefaultMotionPrompt(sceneType as any),
        notes: `${sceneType} - ${speechText.substring(0, 50)}...`,
      }

      scenes.push(scene)
    }

    return scenes
  }

  private generateTitle(prompt: string): string {
    const words = prompt.split(' ').slice(0, 5)
    return words.join(' ')
  }

  private getDefaultSpeech(sceneType: string): string {
    const defaults: Record<string, string> = {
      intro: 'Hello! Let me share something important with you today.',
      problem: 'Many people face this challenge.',
      solution: 'Here is how we solve it.',
      benefits: 'You will see these benefits.',
      'call-to-action': 'Take action today.',
      outro: 'Thank you for watching!',
      overview: 'Let me give you an overview.',
      steps: 'Follow these steps carefully.',
      tips: 'Here are some helpful tips.',
      summary: 'To summarize what we covered.',
      headline: 'Breaking news.',
      details: 'Here are the details.',
      impact: 'This will impact you.',
      outlook: 'Here is what comes next.',
      setup: 'Let me set the scene.',
      conflict: 'Then came the challenge.',
      resolution: 'And here is how it resolved.',
      moral: 'The lesson learned.',
    }
    return defaults[sceneType] || 'Continuing with the presentation.'
  }

  private getDefaultCameraDirection(
    sceneType: string
  ): 'face-camera' | 'looking-left' | 'looking-right' | 'full-body' {
    const directions: Record<string, any> = {
      intro: 'face-camera',
      outro: 'face-camera',
      'call-to-action': 'face-camera',
      'full-body': 'full-body',
    }
    return directions[sceneType] || 'face-camera'
  }

  private getDefaultMotionPrompt(sceneType: string): string {
    const motions: Record<string, string> = {
      intro: 'subtle head nod, friendly smile, confident posture',
      outro: 'gentle wave, warm smile, relaxed stance',
      'call-to-action': 'pointing gesture, enthusiastic expression, leaning forward slightly',
      'full-body': 'walking, gesturing, dynamic movement',
    }
    return motions[sceneType] || 'attentive listening, occasional head movement'
  }
}

export const scriptGenerator = new ScriptGenerator()
