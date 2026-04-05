/**
 * Vision Integration — The Agent's Eyes (OpenClaw C-11)
 *
 * Connects the OCR Engine and Vision Stream to the main Agent Engine.
 * Allows the agent to verify its work by "seeing" the screen.
 */

import { platformAdapter } from './platform-adapter';
// @ts-ignore
import { ocrEngine } from './ocr-engine';

export interface VisionReport {
  timestamp: string;
  screenshot: string | null;
  textFound: string;
  confidence: number;
}

class VisionIntegration {
  /**
   * Take a "Brain Snapshot" of the current screen.
   * Runs OCR to convert pixels into text for the agent to process.
   */
  async captureAndAnalyze(): Promise<VisionReport> {
    console.log('👁️ [Vision] Snapping screen for analysis...');
    
    // 1. Capture screen via platform adapter (Electron or Web API)
    const screenshot = await platformAdapter.captureScreen();
    
    // 2. Run OCR if content is available
    let textFound = '';
    if (ocrEngine) {
      const result = await ocrEngine.readScreen();
      textFound = result.text || '';
    }

    return {
      timestamp: new Date().toISOString(),
      screenshot,
      textFound,
      confidence: 0.92 // Simulated confidence
    };
  }

  /**
   * Specifically watch for a "Success" indicator in a professional app
   * (e.g. looking for "Render Complete" in Blender or Premiere).
   */
  async waitForVisualSignal(signalText: string, timeoutMs: number = 30000): Promise<boolean> {
    console.log(`👁️ [Vision] Watching for visual signal: "${signalText}"`);
    
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const report = await this.captureAndAnalyze();
      if (report.textFound.toLowerCase().includes(signalText.toLowerCase())) {
        console.log(`✅ [Vision] Signal detected: "${signalText}"`);
        return true;
      }
      await new Promise(r => setTimeout(r, 2000)); // check every 2s
    }
    
    return false;
  }
}

export const visionIntegration = new VisionIntegration();
