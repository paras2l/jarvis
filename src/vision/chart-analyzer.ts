import { visionOCREngine } from '@/vision/ocr-engine'

export interface ChartAnalysis {
  summary: string
  symbols: string[]
  signals: string[]
}

class ChartAnalyzer {
  async analyzeVisibleChart(): Promise<ChartAnalysis> {
    const ocr = await visionOCREngine.readScreen()
    const text = (ocr.text || '').toUpperCase()

    const symbols = Array.from(new Set((text.match(/\b[A-Z]{2,6}\b/g) || []).slice(0, 10)))
    const signals: string[] = []

    if (/RSI|MACD|EMA|VWAP|VOLUME/.test(text)) {
      signals.push('Technical indicators detected')
    }

    if (/BUY|SELL|LONG|SHORT|ENTRY|EXIT/.test(text)) {
      signals.push('Trade actions visible on screen')
    }

    const summary = signals.length
      ? `Detected chart context: ${signals.join(', ')}`
      : 'Chart-like context not confidently detected.'

    return { summary, symbols, signals }
  }
}

export const chartAnalyzer = new ChartAnalyzer()
