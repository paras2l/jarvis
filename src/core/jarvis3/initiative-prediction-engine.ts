import { predictionEngine } from '@/core/prediction-engine'
import { RuntimeContextSnapshot } from '@/core/event-bus'

class InitiativePredictionEngine {
  async suggest(context: RuntimeContextSnapshot): Promise<string[]> {
    const predictions = await predictionEngine.infer(context)

    const suggestions = predictions
      .filter((prediction) => prediction.confidence >= 0.6)
      .map((prediction) => `${prediction.reason} -> ${prediction.suggestedAction}`)

    if (!suggestions.length) {
      return ['No high-confidence proactive suggestion right now.']
    }

    return suggestions
  }
}

export const initiativePredictionEngine = new InitiativePredictionEngine()
