/**
 * OCR Engine — Feature #8
 *
 * Screen text extraction without ANY screenshot API.
 * Inspired by JARVIS original's OCR capability — re-built for Electron.
 *
 * Uses Tesseract.js (100% local, free, runs in Node.js via IPC).
 * The agent can READ any app's text without a cloud vision call.
 *
 * This completely eliminates screenshot → API → coordinates workflow
 * for READ operations. The agent just reads text directly.
 *
 * Works with: VS Code panels, browser content, file dialogs, any window.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface OCRResult {
  text: string
  confidence: number   // 0-100
  words: Array<{
    text: string
    confidence: number
    bbox: { x: number; y: number; width: number; height: number }
  }>
  source: 'screen' | 'region' | 'file'
  latencyMs: number
}

export interface ScreenRegion {
  x: number
  y: number
  width: number
  height: number
}

// ── OCREngine ─────────────────────────────────────────────────────────────

class OCREngine {
  private lastResult: OCRResult | null = null
  private cache = new Map<string, OCRResult>()

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Read ALL text visible on the current screen.
   * Returns structured text the agent can reason about.
   */
  async readScreen(): Promise<OCRResult> {
    if (!window.nativeBridge?.captureScreen) {
      return this.unavailable('screen')
    }

    const start = Date.now()
    try {
      // 1. Capture screen as base64 image via Electron IPC
      const capture = await window.nativeBridge.captureScreen()
      if (!capture.success || !capture.imageBase64) {
        return this.unavailable('screen')
      }

      // 2. Send to OCR via IPC (Tesseract runs in main process)
      const result = await window.nativeBridge.runOCR(capture.imageBase64)
      if (!result.success) return this.unavailable('screen')

      const ocr: OCRResult = {
        text: result.text ?? '',
        confidence: result.confidence ?? 0,
        words: result.words ?? [],
        source: 'screen',
        latencyMs: Date.now() - start,
      }

      this.lastResult = ocr
      return ocr
    } catch (err) {
      console.error('[OCR] readScreen error:', err)
      return this.unavailable('screen')
    }
  }

  /**
   * Read text from a specific screen region.
   * Great for reading a specific panel or dialog.
   */
  async readRegion(region: ScreenRegion): Promise<OCRResult> {
    if (!window.nativeBridge?.captureRegion) {
      return this.unavailable('region')
    }

    const start = Date.now()
    try {
      const capture = await window.nativeBridge.captureRegion(region)
      if (!capture.success || !capture.imageBase64) return this.unavailable('region')

      const result = await window.nativeBridge.runOCR(capture.imageBase64)
      if (!result.success) return this.unavailable('region')

      return {
        text: result.text ?? '',
        confidence: result.confidence ?? 0,
        words: result.words ?? [],
        source: 'region',
        latencyMs: Date.now() - start,
      }
    } catch (err) {
      console.error('[OCR] readRegion error:', err)
      return this.unavailable('region')
    }
  }

  /**
   * Read text from an image file path.
   */
  async readFile(imagePath: string): Promise<OCRResult> {
    const cached = this.cache.get(imagePath)
    if (cached) return cached

    if (!window.nativeBridge?.runOCRFile) return this.unavailable('file')

    const start = Date.now()
    try {
      const result = await window.nativeBridge.runOCRFile(imagePath)
      if (!result.success) return this.unavailable('file')

      const ocr: OCRResult = {
        text: result.text ?? '',
        confidence: result.confidence ?? 0,
        words: result.words ?? [],
        source: 'file',
        latencyMs: Date.now() - start,
      }

      this.cache.set(imagePath, ocr)
      return ocr
    } catch {
      return this.unavailable('file')
    }
  }

  /**
   * Find specific text on screen — returns the bounding box if found.
   * Useful for "click on the Save button" without coordinate guessing.
   */
  async findText(searchText: string): Promise<{
    found: boolean
    x?: number
    y?: number
    width?: number
    height?: number
    confidence?: number
  }> {
    const screen = await this.readScreen()
    const lower = searchText.toLowerCase()

    const match = screen.words.find(w => w.text.toLowerCase().includes(lower))
    if (!match) return { found: false }

    return {
      found: true,
      x: match.bbox.x,
      y: match.bbox.y,
      width: match.bbox.width,
      height: match.bbox.height,
      confidence: match.confidence,
    }
  }

  /**
   * Get a plain text summary of what's visible on screen.
   * Perfect for feeding to the agent as context: "What do you see?"
   */
  async describeScreen(): Promise<string> {
    const result = await this.readScreen()
    if (!result.text) return 'Screen is empty or could not be read.'
    return `Screen contains: ${result.text.slice(0, 2000)}`  // cap at 2000 chars
  }

  getLastResult(): OCRResult | null {
    return this.lastResult
  }

  clearCache(): void {
    this.cache.clear()
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private unavailable(source: OCRResult['source']): OCRResult {
    return {
      text: '',
      confidence: 0,
      words: [],
      source,
      latencyMs: 0,
    }
  }
}

export const ocrEngine = new OCREngine()
