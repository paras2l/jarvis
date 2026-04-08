export interface AudioChunkEvent {
  blob: Blob
  createdAt: number
}

export type AudioChunkHandler = (event: AudioChunkEvent) => void

class AudioCapture {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunkHandler: AudioChunkHandler | null = null
  private running = false

  async start(chunkMs: number, onChunk: AudioChunkHandler): Promise<{ success: boolean; message?: string }> {
    if (this.running) {
      return { success: true }
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      return { success: false, message: 'Microphone API unavailable on this platform.' }
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.chunkHandler = onChunk

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg')
          ? 'audio/ogg'
          : ''

      this.recorder = mimeType
        ? new MediaRecorder(this.stream, { mimeType })
        : new MediaRecorder(this.stream)

      this.recorder.ondataavailable = (event: BlobEvent) => {
        if (!event.data || event.data.size === 0 || !this.chunkHandler) return
        this.chunkHandler({ blob: event.data, createdAt: Date.now() })
      }

      this.recorder.start(chunkMs)
      this.running = true
      return { success: true }
    } catch (error) {
      this.stop()
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Microphone not available.',
      }
    }
  }

  stop(): void {
    this.running = false
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop()
    }
    this.recorder = null

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
    }
    this.stream = null
    this.chunkHandler = null
  }

  isRunning(): boolean {
    return this.running
  }
}

export const audioCapture = new AudioCapture()
