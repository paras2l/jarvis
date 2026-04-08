import React, { useState } from 'react'
import voiceHandler from '@/core/voice-handler'

interface VoiceButtonProps {
  onCommand: (command: string) => void
  onActivation?: () => void
  onError?: (message: string) => void
  onTranscript?: (transcript: string, isFinal: boolean) => void
  mode: 'silent' | 'talking'
  onModeChange: (mode: 'silent' | 'talking') => void
}

const VoiceButton: React.FC<VoiceButtonProps> = ({
  onCommand,
  onActivation,
  onError,
  onTranscript,
  mode,
  onModeChange,
}) => {
  const [isListening, setIsListening] = useState(false)

  const handleToggle = () => {
    onModeChange(mode === 'talking' ? 'silent' : 'talking')
  }

  React.useEffect(() => {
    voiceHandler.onActivationCallback = () => {
      if (onActivation) onActivation()
    }

    voiceHandler.onListeningStateChange = (active: boolean) => {
      setIsListening(active)
    }

    voiceHandler.onErrorCallback = (message: string) => {
      if (onError) onError(message)
    }

    voiceHandler.onCommandCallback = (command: string) => {
      onCommand(command)
    }

    voiceHandler.onTranscriptCallback = (transcript: string, isFinal: boolean) => {
      if (onTranscript) onTranscript(transcript, isFinal)
    }

    return () => {
      voiceHandler.onActivationCallback = null
      voiceHandler.onCommandCallback = null
      voiceHandler.onListeningStateChange = null
      voiceHandler.onErrorCallback = null
      voiceHandler.onTranscriptCallback = null
    }
  }, [onCommand, onActivation, onError, onTranscript])

  return (
    <button
      onClick={handleToggle}
      className={`voice-button ${mode === 'talking' ? 'active' : ''}`}
      title={
        mode === 'talking'
          ? 'Talking mode active. Click to switch to silent mode.'
          : 'Silent mode active. Click to switch to talking mode.'
      }
    >
      {isListening ? (mode === 'talking' ? '🔊' : '🔇') : '🎙️'}
    </button>
  )
}

export default VoiceButton
