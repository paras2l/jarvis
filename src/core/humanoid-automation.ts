/**
 * Humanoid Automation Engine
 * Mimics human behavior for stealthy UI automation
 */

export interface Point {
  x: number;
  y: number;
}

class HumanoidAutomation {
  /**
   * Generate a Bezier path between two points
   * Creates a natural curved movement instead of a straight line
   */
  generateBezierPath(start: Point, end: Point, steps: number = 25): Point[] {
    const path: Point[] = [];
    
    // Create two random control points for a cubic Bezier curve
    const cp1: Point = {
      x: start.x + (end.x - start.x) * Math.random() * 0.5,
      y: start.y + (end.y - start.y) * Math.random() * 1.5 - (end.y - start.y) * 0.25,
    };
    
    const cp2: Point = {
      x: start.x + (end.x - start.x) * (0.5 + Math.random() * 0.5),
      y: start.y + (end.y - start.y) * Math.random() * 1.5 - (end.y - start.y) * 0.25,
    };

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Cubic Bezier formula: (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)*t^2*P2 + t^3*P3
      const x = Math.pow(1 - t, 3) * start.x + 
                3 * Math.pow(1 - t, 2) * t * cp1.x + 
                3 * (1 - t) * Math.pow(t, 2) * cp2.x + 
                Math.pow(t, 3) * end.x;
                
      const y = Math.pow(1 - t, 3) * start.y + 
                3 * Math.pow(1 - t, 2) * t * cp1.y + 
                3 * (1 - t) * Math.pow(t, 2) * cp2.y + 
                Math.pow(t, 3) * end.y;
      
      path.push(this.injectJitter({ x, y }, 1));
    }

    return path;
  }

  /**
   * Inject tiny random offsets to simulate hand tremor
   */
  injectJitter(point: Point, intensity: number = 1): Point {
    return {
      x: point.x + (Math.random() - 0.5) * intensity,
      y: point.y + (Math.random() - 0.5) * intensity,
    };
  }

  /**
   * Get a random delay using Gaussian (Normal) distribution
   * @param mean Center of the distribution
   * @param stdDev Standard deviation (spread)
   */
  getGaussianDelay(mean: number, stdDev: number): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return Math.max(0, mean + z * stdDev);
  }

  /**
   * Simulate a human-like typing cadence for a string
   */
  async typeHumanoid(text: string, onChar: (char: string) => Promise<void>) {
    for (const char of text) {
      await onChar(char);
      // Average 150ms per key with 50ms variance
      const delay = this.getGaussianDelay(150, 50);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Occasional "thinking" pause after words/punctuation
      if (' .?!,'.includes(char) && Math.random() > 0.7) {
        await new Promise(resolve => setTimeout(resolve, this.getGaussianDelay(400, 150)));
      }
    }
  }

  /**
   * Human-like click with random down/up interval
   */
  async clickHumanoid(onClick: () => Promise<void>) {
    // Human clicks take between 30ms and 120ms
    const holdTime = this.getGaussianDelay(75, 25);
    // In a real implementation with mouse-down/up separate IPCs, 
    // we would wait between them. For now, we simulate the total event.
    await onClick();
    await new Promise(resolve => setTimeout(resolve, holdTime));
  }
}

export const humanoidAutomation = new HumanoidAutomation();
