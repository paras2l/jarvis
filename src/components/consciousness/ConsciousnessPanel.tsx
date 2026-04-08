/**
 * ConsciousnessPanel.tsx - UI for Consciousness Engine + Hotword + Sentiment + Commands
 * 
 * Displays:
 * - Hotword listening status
 * - Current emotion/mood
 * - Confidence levels
 * - Custom command management
 * - Consciousness metrics (learning, empathy, self-awareness)
 * - Cross-device support
 */

'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { consciousnessAwareOrchestrator } from '@/core/consciousness/consciousness-orchestrator'
import type { ConsciousnessSnapshot } from '@/core/consciousness/consciousness-engine'

const pickSituationAwareResponse = (variants: string[], seedParts: Array<string | number | undefined>): string => {
  if (!variants.length) return ''
  const seed = seedParts.map((part) => String(part ?? '')).join('|')
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(index)
    hash |= 0
  }
  return variants[Math.abs(hash) % variants.length]
}

export const ConsciousnessPanel: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [currentEmotion, setCurrentEmotion] = useState<string>('calm')
  const [confidence, setConfidence] = useState(0.5)
  const [consciousness, setConsciousness] = useState<ConsciousnessSnapshot | null>(null)
  const [recentCommands, setRecentCommands] = useState<string[]>([])
  const [commandSuggestions, setCommandSuggestions] = useState<Array<{ name: string; description: string }>>([])
  const [customCommandName, setCustomCommandName] = useState('')
  const [customCommandPattern, setCustomCommandPattern] = useState('')
  const [customCommandAction, setCustomCommandAction] = useState('')
  const [customCommandDescription, setCustomCommandDescription] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [platform, setPlatform] = useState<'web' | 'mobile' | 'desktop'>('web')
  const [emotionalTrajectory, setEmotionalTrajectory] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      try {
        const ua = navigator.userAgent.toLowerCase()
        const detectedPlatform: 'web' | 'mobile' | 'desktop' = (window as any).electronBridge
          ? 'desktop'
          : /android|iphone|ipad|ipod/.test(ua)
            ? 'mobile'
            : 'web'
        setPlatform(detectedPlatform)

        const initialized = await consciousnessAwareOrchestrator.initialize({
          userId: 'user_' + Date.now(),
          platform: detectedPlatform,
          hotwordKeywords: ['jarvis', 'hey'],
          enableConsciousnessMode: true,
        })

        if (initialized) {
          setIsInitialized(true)
          const status = consciousnessAwareOrchestrator.getConsciousnessStatus()
          setConsciousness(status)
        }
      } catch (error) {
        console.error('Failed to initialize consciousness panel:', error)
      }
    }

    init()
  }, [])

  // Handle hotword listening toggle
  const toggleHotwordListening = useCallback(async () => {
    if (isListening) {
      consciousnessAwareOrchestrator.stopListeningForHotword()
      setIsListening(false)
    } else {
      const success = await consciousnessAwareOrchestrator.startListeningForHotword()
      setIsListening(success)
    }
  }, [isListening])

  // Handle command submission
  const handleCommandSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!inputRef.current) return

      const command = inputRef.current.value.trim()
      if (!command) return

      setIsProcessing(true)
      setRecentCommands(prev => [command, ...prev.slice(0, 9)])

      try {
        const result = await consciousnessAwareOrchestrator.handleCommand(command)

        // Update UI with results
        setCurrentEmotion(result.emotion || 'calm')
        setConfidence(result.confidence || 0.5)
        setConsciousness(result.consciousness || null)

        // Show results to user
        if (result.speech) {
          // Could play audio here
          console.log(
            pickSituationAwareResponse([
              'Jarvis:',
              'Consciousness response:',
              'Situation-aware reply:',
            ], [command, result.emotion, result.confidence]),
            result.speech,
          )
        }

        // Update trajectory
        setEmotionalTrajectory(prev => [
          `${result.emotion || 'calm'}:${command}`,
          ...prev.slice(0, 4),
        ])
      } catch (error) {
        console.error('Command handling failed:', error)
      } finally {
        setIsProcessing(false)
        inputRef.current.value = ''
      }
    },
    [recentCommands]
  )

  // Handle input change for command suggestions
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value
    if (value.length > 2) {
      const suggestions = consciousnessAwareOrchestrator.suggestCommands(value)
      setCommandSuggestions(suggestions)
    } else {
      setCommandSuggestions([])
    }
  }

  // Handle add custom command
  const handleAddCustomCommand = useCallback(async () => {
    if (!customCommandName || !customCommandPattern || !customCommandAction) {
      alert(pickSituationAwareResponse([
        'Please fill in all required fields',
        'I need the command name, pattern, and action before I can save it.',
        'Fill in the required fields so I can learn the new command.',
      ], [customCommandName, customCommandPattern, customCommandAction, 'missing-fields']))
      return
    }

    try {
      const success = await consciousnessAwareOrchestrator.addCustomCommand(
        customCommandName,
        customCommandPattern,
        customCommandAction,
        customCommandDescription
      )

      if (success) {
        alert(pickSituationAwareResponse([
          `Command "${customCommandName}" added successfully!`,
          `I learned the command "${customCommandName}" successfully.`,
          `Saved. The command "${customCommandName}" is now part of my response set.`,
        ], [customCommandName, customCommandPattern, customCommandAction, 'saved']))
        setCustomCommandName('')
        setCustomCommandPattern('')
        setCustomCommandAction('')
        setCustomCommandDescription('')
      }
    } catch (error) {
      console.error('Failed to add custom command:', error)
    }
  }, [customCommandName, customCommandPattern, customCommandAction, customCommandDescription])

  const emotionColors: Record<string, string> = {
    happy: 'bg-yellow-100 text-yellow-800',
    sad: 'bg-blue-100 text-blue-800',
    angry: 'bg-red-100 text-red-800',
    scared: 'bg-purple-100 text-purple-800',
    surprised: 'bg-pink-100 text-pink-800',
    curious: 'bg-green-100 text-green-800',
    calm: 'bg-slate-100 text-slate-800',
    confused: 'bg-orange-100 text-orange-800',
  }

  if (!isInitialized) {
    return (
      <div className="p-6 bg-slate-50 rounded-lg border border-slate-200">
        <div className="text-center">
          <div className="spinnerani mb-4" />
          <p className="text-slate-600">{pickSituationAwareResponse([
            'Initializing consciousness engine...',
            'Waking the consciousness layer...',
            'Bringing the shared brain online...',
          ], ['initializing', platform])}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 bg-white rounded-lg border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Jarvis Consciousness</h2>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${emotionColors[currentEmotion] || emotionColors.calm}`}>
          {currentEmotion}
        </div>
      </div>

      {/* Platform & Status */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="p-3 bg-slate-50 rounded">
          <p className="text-xs text-slate-600">Platform</p>
          <p className="text-sm font-semibold text-slate-900 capitalize">{platform}</p>
        </div>
        <div className="p-3 bg-slate-50 rounded">
          <p className="text-xs text-slate-600">Consciousness</p>
          <p className="text-sm font-semibold text-slate-900 capitalize">{consciousness?.selfAwareness || 'minimal'}</p>
        </div>
        <div className="p-3 bg-slate-50 rounded">
          <p className="text-xs text-slate-600">Confidence</p>
          <p className="text-sm font-semibold text-slate-900">{(confidence * 100).toFixed(0)}%</p>
        </div>
        <div className="p-3 bg-slate-50 rounded">
          <p className="text-xs text-slate-600">Commands Learned</p>
          <p className="text-sm font-semibold text-slate-900">{consciousness?.recentLearnings.length || 0}</p>
        </div>
      </div>

      {/* Hotword Control */}
      <div className="border-t pt-4">
        <button
          onClick={toggleHotwordListening}
          className={`w-full py-2 px-4 rounded font-medium transition ${
            isListening
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {isListening
            ? pickSituationAwareResponse([
                '🔴 Listening for hotword...',
                '🔴 I am listening for the wake word...',
                '🔴 Hotword listening is active...',
              ], [platform, currentEmotion, 'listening'])
            : pickSituationAwareResponse([
                '🎤 Start Hotword Detection',
                '🎤 Enable wake word listening',
                '🎤 Turn on hotword detection',
              ], [platform, currentEmotion, 'start'])}
        </button>
        <p className="text-xs text-slate-600 mt-2">
          {isListening
            ? pickSituationAwareResponse([
                'Say "Jarvis" or "Hey" to activate voice commands',
                'Use the wake word to trigger the voice pipeline.',
                'Say the hotword and I will wake up for action.',
              ], [platform, currentEmotion, 'wake'])
            : pickSituationAwareResponse([
                'Hotword detection reduces API calls by 70%!',
                'Wake-word listening saves API usage and keeps the app efficient.',
                'Hotword detection stays local, so fewer cloud calls are needed.',
              ], [platform, currentEmotion, 'idle'])}
        </p>
      </div>

      {/* Voice Command Input */}
      <form onSubmit={handleCommandSubmit} className="border-t pt-4">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            onChange={handleInputChange}
            placeholder={pickSituationAwareResponse([
              'Enter command or ask a question...',
              'Describe the situation, command, or request...',
              'Ask me anything or give me a command...',
            ], [platform, currentEmotion, 'main-input'])}
            className="w-full px-4 py-3 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isProcessing}
          />
          <button
            type="submit"
            disabled={isProcessing}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-slate-400"
          >
            {isProcessing ? '⏳' : '▶'}
          </button>
        </div>

        {/* Command Suggestions */}
        {commandSuggestions.length > 0 && (
          <div className="mt-2 bg-slate-50 rounded border border-slate-200 p-2">
            <p className="text-xs font-semibold text-slate-600 mb-2">Suggestions:</p>
            <div className="space-y-2">
              {commandSuggestions.map((cmd, i) => (
                <div
                  key={i}
                  className="p-2 bg-white rounded cursor-pointer hover:bg-blue-50 transition"
                  onClick={() => {
                    if (inputRef.current) {
                      inputRef.current.value = cmd.name
                      setCommandSuggestions([])
                    }
                  }}
                >
                  <p className="font-medium text-sm text-slate-900">{cmd.name}</p>
                  <p className="text-xs text-slate-600">{cmd.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>

      {/* Custom Command Builder */}
      <div className="border-t pt-4">
        <h3 className="font-semibold text-slate-900 mb-3">Add Custom Command</h3>
        <div className="space-y-3">
          <input
            type="text"
            placeholder={pickSituationAwareResponse([
              "Command name (e.g. 'coffee')",
              'Give this command a clear name...',
              'Name the behavior you want me to learn...',
            ], [customCommandName, 'name'])}
            value={customCommandName}
            onChange={e => setCustomCommandName(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder={pickSituationAwareResponse([
              "Pattern (e.g. 'make coffee|brew coffee')",
              'Add the phrases or pattern I should match...',
              'Write the command pattern or keyword match here...',
            ], [customCommandPattern, 'pattern'])}
            value={customCommandPattern}
            onChange={e => setCustomCommandPattern(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder={pickSituationAwareResponse([
              "Action (e.g. 'call_api://smart_home/coffee')",
              'Define what should happen when I match this command...',
              'Tell me the action or endpoint for this command...',
            ], [customCommandAction, 'action'])}
            value={customCommandAction}
            onChange={e => setCustomCommandAction(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            placeholder={pickSituationAwareResponse([
              'Description (optional)',
              'Add details if you want me to remember the intent...',
              'Optional notes for how I should use this command...',
            ], [customCommandDescription, 'description'])}
            value={customCommandDescription}
            onChange={e => setCustomCommandDescription(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
          />
          <button
            onClick={handleAddCustomCommand}
            className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition font-medium"
          >
            ✨ Add Custom Command
          </button>
        </div>
      </div>

      {/* Recent Commands */}
      {recentCommands.length > 0 && (
        <div className="border-t pt-4">
          <h3 className="font-semibold text-slate-900 mb-3">Recent Commands</h3>
          <div className="space-y-2">
            {recentCommands.slice(0, 5).map((cmd, i) => (
              <div key={i} className="p-2 bg-slate-50 rounded text-sm text-slate-700">
                {cmd}
              </div>
            ))}
          </div>
        </div>
      )}

      {emotionalTrajectory.length > 0 && (
        <div className="border-t pt-4">
          <h3 className="font-semibold text-slate-900 mb-3">Emotional Trajectory</h3>
          <div className="space-y-2 text-sm text-slate-700">
            {emotionalTrajectory.slice(0, 5).map((entry, index) => (
              <div key={index} className="p-2 bg-slate-50 rounded">
                {entry}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Consciousness Metrics */}
      {consciousness && (
        <div className="border-t pt-4">
          <h3 className="font-semibold text-slate-900 mb-3">Consciousness Metrics</h3>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-slate-600">Empathy Level:</span>{' '}
              <span className="font-medium text-slate-900">
                {((consciousness.personalityTraits.empathy || 0) * 100).toFixed(0)}%
              </span>
            </p>
            <p>
              <span className="text-slate-600">Curiosity:</span>{' '}
              <span className="font-medium text-slate-900">
                {((consciousness.personalityTraits.curiosity || 0) * 100).toFixed(0)}%
              </span>
            </p>
            <p>
              <span className="text-slate-600">Humility:</span>{' '}
              <span className="font-medium text-slate-900">
                {((consciousness.personalityTraits.humility || 0) * 100).toFixed(0)}%
              </span>
            </p>
            <p>
              <span className="text-slate-600">Recent Learning:</span>{' '}
              {consciousness.recentLearnings.length > 0 && (
                <span className="text-xs text-slate-600 italic">
                  {consciousness.recentLearnings[0]}
                </span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
