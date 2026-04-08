import { visionOCREngine } from '@/vision/ocr-engine'

export interface UIDetectedElement {
  label: string
  kind: 'button' | 'input' | 'tab' | 'menu' | 'unknown'
  confidence: number
}

class UIDetector {
  async detect(): Promise<UIDetectedElement[]> {
    const ocr = await visionOCREngine.readScreen()
    if (!ocr.text) return []

    const candidates = ocr.words.slice(0, 120).map((word) => word.text).filter(Boolean)
    return candidates
      .map((label) => {
        const lower = label.toLowerCase()
        const kind = /save|ok|cancel|submit|buy|sell|send/.test(lower)
          ? 'button'
          : /search|email|password|name/.test(lower)
            ? 'input'
            : /home|settings|dashboard|profile/.test(lower)
              ? 'tab'
              : /menu|more|file|edit/.test(lower)
                ? 'menu'
                : 'unknown'

        return {
          label,
          kind,
          confidence: 0.6,
        } as UIDetectedElement
      })
      .filter((item) => item.kind !== 'unknown')
      .slice(0, 30)
  }
}

export const uiDetector = new UIDetector()
