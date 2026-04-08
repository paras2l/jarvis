import { ocrEngine as coreOCREngine, OCRResult } from '@/core/ocr-engine'

class VisionOCREngine {
  readScreen(): Promise<OCRResult> {
    return coreOCREngine.readScreen()
  }

  readRegion(region: { x: number; y: number; width: number; height: number }): Promise<OCRResult> {
    return coreOCREngine.readRegion(region)
  }

  findText(text: string): Promise<{ found: boolean; x?: number; y?: number; width?: number; height?: number; confidence?: number }> {
    return coreOCREngine.findText(text)
  }
}

export const visionOCREngine = new VisionOCREngine()
