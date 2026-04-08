import { screenCapture } from '@/vision/screen-capture'
import { visionOCREngine } from '@/vision/ocr-engine'
import { providerMatrixRouter } from '@/core/provider-matrix-router'

export interface MultimodalVisionResult {
  summary: string
  ocrText: string
  provider: string
  confidence: number
}

class MultimodalVision {
  async analyzeCurrentScreen(promptHint = 'Analyze visible UI and extract intent-relevant context.'): Promise<MultimodalVisionResult> {
    const capture = await screenCapture.captureDesktop()
    const ocr = await visionOCREngine.readScreen()

    const contextPrompt = [
      'You are a multimodal analyst operating with OCR + screenshot metadata.',
      `Task: ${promptHint}`,
      `Screen capture available: ${capture.success}`,
      `OCR text: ${ocr.text || 'none'}`,
      'Return a short actionable summary.',
    ].join('\n')

    const response = await providerMatrixRouter.query(contextPrompt, {
      taskClass: 'vision',
      urgency: 'normal',
    })

    return {
      summary: response.content || 'No vision summary generated.',
      ocrText: ocr.text || '',
      provider: response.provider,
      confidence: ocr.confidence ? Math.min(1, ocr.confidence / 100) : 0.55,
    }
  }
}

export const multimodalVision = new MultimodalVision()
