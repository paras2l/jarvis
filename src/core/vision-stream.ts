import { permissionCenter } from './platform/permission-center'

export class VisionStream {
  private activeStream: MediaStream | null = null
  private isEyesClosed: boolean = false
  private monitoringInterval: number | null = null

  async openEyes(): Promise<{ success: boolean; stream?: MediaStream; message: string }> {
    if (this.activeStream) {
      if (this.isEyesClosed) {
        // Just unpause video tracks if possible, though pausing usually means stopping in WebRTC
        // If we stopped them, we need to re-request.
        return this.startStream()
      }
      return { success: true, stream: this.activeStream, message: 'Eyes already open' }
    }

    return this.startStream()
  }

  private async startStream(): Promise<{ success: boolean; stream?: MediaStream; message: string }> {
    try {
      if (!window.nativeBridge?.getScreenSourceId) {
        return { success: false, message: 'Screen source ID fetch is not supported in this environment.' }
      }

      const res = await window.nativeBridge.getScreenSourceId()
      if (!res.success || !res.sourceId) {
        return { success: false, message: res.message || 'Failed to obtain screen source ID.' }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: res.sourceId,
            minWidth: 1280,
            maxWidth: 1920,
            minHeight: 720,
            maxHeight: 1080
          }
        } as any
      })

      this.activeStream = stream
      this.isEyesClosed = false
      this.startBackgroundMonitoring()

      return { success: true, stream, message: 'Stream started. Eyes are open.' }
    } catch (err) {
      console.error('VisionStream start error:', err)
      return { success: false, message: 'Could not access the screen stream.' }
    }
  }

  closeEyes() {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach(track => track.stop())
      this.activeStream = null
    }
    this.isEyesClosed = true
    this.stopBackgroundMonitoring()
  }

  private startBackgroundMonitoring() {
    if (this.monitoringInterval) return

    this.monitoringInterval = window.setInterval(async () => {
      if (this.isEyesClosed) return

      try {
        if (window.nativeBridge?.getForegroundWindow) {
          const res = await window.nativeBridge.getForegroundWindow()
          if (res.success && res.windowTitle) {
            this.checkSensitiveContent(res.windowTitle)
          }
        }
      } catch {
        // silent fail on monitor loop
      }
    }, 2000)
  }

  private stopBackgroundMonitoring() {
    if (this.monitoringInterval) {
      window.clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
  }

  private checkSensitiveContent(title: string) {
    const sensitiveKeywords = ['password', 'login', 'credential', 'vault', '1password', 'bitwarden', 'lastpass']
    const titleLower = title.toLowerCase()

    const isSensitive = sensitiveKeywords.some(kw => titleLower.includes(kw))

    if (isSensitive) {
      // Check if user has given emergency override
      const isEmergencyOverrideActive = permissionCenter.isEmergencyOverrideActive()

      if (!isEmergencyOverrideActive) {
        console.warn(`Sensitive window detected ("${title}"). Closing eyes for privacy.`)
        this.closeEyes()
        
        // Emitting an event or invoking a callback would go here to notify the chat
        // that the agent has closed its eyes and is waiting for manual intervention.
        const event = new CustomEvent('agent:eyes-closed-privacy', { 
          detail: { windowTitle: title }
        })
        window.dispatchEvent(event)
      } else {
        console.log(`Sensitive window detected ("${title}"), but emergency override is ACTIVE. Proceeding.`)
      }
    }
  }

  /**
   * Captures a single high-resolution frame from the active stream
   * and returns it as a base64-encoded PNG.
   */
  async captureFrame(): Promise<string | null> {
    if (!this.activeStream) {
      const res = await this.openEyes()
      if (!res.success) return null
    }

    const videoTrack = this.activeStream?.getVideoTracks()[0]
    if (!videoTrack) return null

    // Create a temporary video element to play the stream
    const video = document.createElement('video')
    video.srcObject = this.activeStream
    await video.play()

    // Create a canvas to draw the frame
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    // Clean up video element
    video.pause()
    video.srcObject = null
    video.remove()

    return canvas.toDataURL('image/png')
  }
}

export const visionStream = new VisionStream()
