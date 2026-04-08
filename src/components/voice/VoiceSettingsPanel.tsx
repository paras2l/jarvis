import React, { useState, useEffect } from 'react'
import { voicePreferencesManager, type VoicePreferences } from '@/voice/voice-preferences'
import { speechSynthesisRuntime } from '@/voice/speech-synthesis'

export function VoiceSettingsPanel() {
  const [prefs, setPrefs] = useState<VoicePreferences>(voicePreferencesManager.getPreferences())
  const [testPlaying, setTestPlaying] = useState(false)

  const updatePreferences = (newPrefs: Partial<VoicePreferences>) => {
    const updated = { ...prefs, ...newPrefs }
    setPrefs(updated)

    if (newPrefs.personality) {
      voicePreferencesManager.setPersonality(newPrefs.personality)
    }
    if (newPrefs.volumeLevel !== undefined) {
      voicePreferencesManager.setVolumeLevel(newPrefs.volumeLevel)
    }
    if (newPrefs.pitchMultiplier !== undefined) {
      voicePreferencesManager.setPitchMultiplier(newPrefs.pitchMultiplier)
    }
    if (newPrefs.rateMultiplier !== undefined) {
      voicePreferencesManager.setRateMultiplier(newPrefs.rateMultiplier)
    }
    if (newPrefs.enableAutoPersonality !== undefined) {
      voicePreferencesManager.setAutoPersonality(newPrefs.enableAutoPersonality)
    }
  }

  const testVoice = async () => {
    if (testPlaying) return
    setTestPlaying(true)

    const testMessages: Record<typeof prefs.personality, string> = {
      cute: "Hi there! I'm your cute assistant. How can I brighten your day today?",
      warm: "Hello! I'm here to help you with warmth and care. What can I do for you?",
      professional: "Good day. I am ready to assist you with your tasks and requests.",
      energetic: "Hey! Let's get things done! What exciting challenge should we tackle next?",
      calm: "Welcome. Let us take a moment and work through this together, peacefully.",
    }

    try {
      await speechSynthesisRuntime.speak(testMessages[prefs.personality], {
        personality: prefs.personality,
      })
    } finally {
      setTestPlaying(false)
    }
  }

  return (
    <div className="ai-panel voice-settings-panel">
      <h2 className="panel-title">🎤 Voice Settings</h2>

      {/* Personality Selection */}
      <div className="settings-section">
        <label className="setting-label">Voice Personality</label>
        <div className="personality-grid">
          {(['cute', 'warm', 'professional', 'energetic', 'calm'] as const).map((p) => (
            <button
              key={p}
              className={`personality-btn ${prefs.personality === p ? 'active' : ''}`}
              onClick={() => updatePreferences({ personality: p })}
              title={`Switch to ${p} voice`}
            >
              {p === 'cute' && '🎀'}
              {p === 'warm' && '🌞'}
              {p === 'professional' && '💼'}
              {p === 'energetic' && '⚡'}
              {p === 'calm' && '🧘'}
              <span>{p.charAt(0).toUpperCase() + p.slice(1)}</span>
            </button>
          ))}
        </div>
        <p className="personality-desc">{voicePreferencesManager.describe()}</p>
      </div>

      {/* Volume Control */}
      <div className="settings-section">
        <label className="setting-label">
          Volume: {Math.round(prefs.volumeLevel * 100)}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(prefs.volumeLevel * 100)}
          onChange={(e) => updatePreferences({ volumeLevel: parseInt(e.target.value) / 100 })}
          className="slider"
        />
      </div>

      {/* Pitch Control */}
      <div className="settings-section">
        <label className="setting-label">
          Pitch: {(prefs.pitchMultiplier * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min="50"
          max="200"
          value={prefs.pitchMultiplier * 100}
          onChange={(e) => updatePreferences({ pitchMultiplier: parseInt(e.target.value) / 100 })}
          className="slider"
        />
        <p className="slider-hint">Lower = deeper, Higher = higher pitched</p>
      </div>

      {/* Rate Control */}
      <div className="settings-section">
        <label className="setting-label">
          Speech Rate: {(prefs.rateMultiplier * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min="50"
          max="200"
          value={prefs.rateMultiplier * 100}
          onChange={(e) => updatePreferences({ rateMultiplier: parseInt(e.target.value) / 100 })}
          className="slider"
        />
        <p className="slider-hint">Lower = slower, Higher = faster</p>
      </div>

      {/* Auto Personality */}
      <div className="settings-section checkbox-section">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={prefs.enableAutoPersonality}
            onChange={(e) => updatePreferences({ enableAutoPersonality: e.target.checked })}
          />
          <span>Auto-adapt personality based on context</span>
        </label>
      </div>

      {/* Test Button */}
      <div className="settings-section">
        <button
          className={`test-btn ${testPlaying ? 'playing' : ''}`}
          onClick={testVoice}
          disabled={testPlaying}
        >
          {testPlaying ? '🔊 Playing...' : '🔊 Test Voice'}
        </button>
      </div>

      {/* Reset Button */}
      <div className="settings-section">
        <button
          className="reset-btn"
          onClick={() => {
            voicePreferencesManager.resetToDefaults()
            setPrefs(voicePreferencesManager.getPreferences())
          }}
        >
          Reset to Defaults
        </button>
      </div>

      <style jsx>{`
        .voice-settings-panel {
          padding: 1.5rem;
          border-radius: 10px;
          background: linear-gradient(135deg, rgba(138, 43, 226, 0.08), rgba(75, 0, 130, 0.08));
          border: 1px solid rgba(138, 43, 226, 0.3);
        }

        .panel-title {
          margin: 0 0 1.5rem 0;
          font-size: 1.3rem;
          font-weight: 600;
          color: #fff;
        }

        .settings-section {
          margin-bottom: 1.5rem;
        }

        .setting-label {
          display: block;
          margin-bottom: 0.75rem;
          font-size: 0.95rem;
          font-weight: 500;
          color: #e0e0e0;
        }

        .personality-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .personality-btn {
          padding: 0.75rem;
          border: 2px solid rgba(138, 43, 226, 0.5);
          border-radius: 8px;
          background: rgba(138, 43, 226, 0.1);
          color: #e0e0e0;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .personality-btn:hover {
          border-color: rgba(138, 43, 226, 0.8);
          background: rgba(138, 43, 226, 0.2);
        }

        .personality-btn.active {
          border-color: #aa2be2;
          background: rgba(138, 43, 226, 0.4);
          color: #fff;
          font-weight: 600;
        }

        .personality-desc {
          margin: 0.5rem 0 0 0;
          font-size: 0.85rem;
          color: #b0b0b0;
          font-style: italic;
        }

        .slider {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: rgba(138, 43, 226, 0.3);
          outline: none;
          -webkit-appearance: none;
        }

        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #aa2be2;
          cursor: pointer;
          transition: background 0.2s;
        }

        .slider::-webkit-slider-thumb:hover {
          background: #d946ef;
        }

        .slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #aa2be2;
          cursor: pointer;
          border: none;
          transition: background 0.2s;
        }

        .slider::-moz-range-thumb:hover {
          background: #d946ef;
        }

        .slider-hint {
          margin: 0.5rem 0 0 0;
          font-size: 0.8rem;
          color: #888;
        }

        .checkbox-section {
          display: flex;
          align-items: center;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          cursor: pointer;
          font-size: 0.95rem;
          color: #e0e0e0;
        }

        .checkbox-label input {
          cursor: pointer;
          width: 18px;
          height: 18px;
        }

        .test-btn,
        .reset-btn {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid rgba(138, 43, 226, 0.6);
          border-radius: 8px;
          background: rgba(138, 43, 226, 0.15);
          color: #e0e0e0;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 0.95rem;
        }

        .test-btn:hover:not(:disabled) {
          background: rgba(138, 43, 226, 0.3);
          border-color: #aa2be2;
        }

        .test-btn.playing {
          background: rgba(138, 43, 226, 0.4);
          color: #ffd700;
        }

        .test-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .reset-btn {
          margin-top: 1rem;
          background: rgba(220, 20, 60, 0.15);
          border-color: rgba(220, 20, 60, 0.5);
        }

        .reset-btn:hover {
          background: rgba(220, 20, 60, 0.25);
          border-color: crimson;
        }
      `}</style>
    </div>
  )
}

export default VoiceSettingsPanel
