export interface ScreenCaptureResult {
  success: boolean
  imageBase64?: string
  message?: string
  timestamp: number
}

class ScreenCapture {
  async captureDesktop(): Promise<ScreenCaptureResult> {
    if (!window.nativeBridge?.captureScreen) {
      return { success: false, message: 'Native screen capture unavailable', timestamp: Date.now() }
    }

    const result = await window.nativeBridge.captureScreen()
    return {
      success: result.success,
      imageBase64: result.imageBase64,
      message: result.message,
      timestamp: Date.now(),
    }
  }
}

export const screenCapture = new ScreenCapture()
