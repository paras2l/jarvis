import React, { useState } from 'react'
import voiceHandler from '@/core/voice-handler'

interface VoiceButtonProps {
  onCommand: (command: string) => void
  onActivation?: () => void
  onError?: (message: string) => void
}

const VoiceButton: React.FC<VoiceButtonProps> = ({ onCommand, onActivation, onError }) => {
  const [isActive, setIsActive] = useState(false)

  const handleToggle = () => {
    if (isActive) {
      voiceHandler.stopListening()
      setIsActive(false)
    } else {
      const result = voiceHandler.startListening()
      if (!result.success) {
        if (onError) {
          onError(result.message)
        }
        return
      }

      setIsActive(true)
    }
  }

  React.useEffect(() => {
    voiceHandler.onActivationCallback = () => {
      if (onActivation) onActivation()
    }

    voiceHandler.onCommandCallback = (command: string) => {
      onCommand(command)
    }

    return () => {
      voiceHandler.onActivationCallback = null
      voiceHandler.onCommandCallback = null
    }
  }, [onCommand, onActivation])

  return (
    <button
      onClick={handleToggle}
      className={`voice-button ${isActive ? 'active' : ''}`}
      title={
        isActive
          ? 'Voice Recognition Active - Click to Deactivate'
          : 'Click to Activate Voice Recognition'
      }
    >
      {isActive ? '🎤' : '🎙️'}
    </button>
  )
}

export default VoiceButton
