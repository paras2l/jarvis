import React, { useState, useRef, useEffect } from 'react'
import MessageBubble from './MessageBubble.tsx'
import TaskDisplay from './TaskDisplay.tsx'
import VoiceButton from './VoiceButton.tsx'
import ThemeToggle from './ThemeToggle.tsx'
import SettingsPanel from './SettingsPanel.tsx'
import { APIConfigPanel } from './APIConfigPanel.tsx'
import './ChatInterface.css'
import { Message, Task } from '@/types'
import agentEngine from '@/core/agent-engine'
import {
  createChatHistorySession,
  getLatestChatHistory,
  upsertChatHistory,
} from '@/core/chat-history'
import { intelligenceRouter } from '@/core/intelligence-router'
import taskExecutor from '@/core/task-executor'
import { memoryEngine } from '@/core/memory-engine'
import { memoryTierService } from '@/core/memory/memory-tier-service'
import { localVoiceRuntime } from '@/core/media-ml/runtimes/local-voice-runtime'
import voiceHandler from '@/core/voice-handler'
import { runtimeStatusStore, RuntimeStatusSnapshot } from '@/core/runtime-status'
import { db } from '@/lib/db'

interface ChatInterfaceProps {
  isDark: boolean
  onThemeToggle: () => void
}

type PendingExecution = {
  parsed: { intent: string; action: string; confidence: number; subAgentRequired: boolean; parameters: Record<string, unknown> }
  originalText: string
  fromVoice: boolean
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  isDark,
  onThemeToggle,
}: ChatInterfaceProps) => {
  const initialMessage: Message = {
    id: 'init-1',
    type: 'agent',
    content: 'Hey Paras! 👋 I\'m Patrich, your personal sovereign companion. How can I help you today?',
    timestamp: new Date(),
  }
  const latestHistoryRef = useRef(getLatestChatHistory())
  const latestHistory = latestHistoryRef.current
  const [activeAgentName, setActiveAgentName] = useState('Main Agent')
  const [historySessionId, setHistorySessionId] = useState(() =>
    latestHistory?.id || createChatHistorySession([initialMessage]).id
  )
  const [historyCreatedAt, setHistoryCreatedAt] = useState(() =>
    latestHistory?.createdAt || new Date()
  )
  const [messages, setMessages] = useState<Message[]>(() =>
    latestHistory?.messages?.length ? latestHistory.messages : [initialMessage]
  )

  const [inputValue, setInputValue] = useState('')
  const [currentTask, setCurrentTask] = useState<Task | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAPIConfigOpen, setIsAPIConfigOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [currentMood, setCurrentMood] = useState('casual')
  const [deviceClass, setDeviceClass] = useState<'mobile' | 'tablet' | 'desktop'>('desktop')
  const [pendingExecution, setPendingExecution] = useState<PendingExecution | null>(null)
  const [voiceDraft, setVoiceDraft] = useState('')
  const [voiceMode, setVoiceMode] = useState<'silent' | 'talking'>(() => {
    const saved = localStorage.getItem('patrich.voiceMode')
    return saved === 'silent' ? 'silent' : 'talking'
  })
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusSnapshot>(runtimeStatusStore.get())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mainAgent = agentEngine.initializeMainAgent('user-1')
    setActiveAgentName(mainAgent.name)
    // Load long-term memories from Supabase on startup
    memoryEngine.loadMemories().catch(() => {})
  }, [])

  useEffect(() => {
    const classifyDevice = () => {
      const width = window.innerWidth
      if (width <= 640) {
        setDeviceClass('mobile')
      } else if (width <= 1024) {
        setDeviceClass('tablet')
      } else {
        setDeviceClass('desktop')
      }
    }

    classifyDevice()
    window.addEventListener('resize', classifyDevice)
    return () => window.removeEventListener('resize', classifyDevice)
  }, [])

  useEffect(() => {
    let cleanup: (() => void) | undefined
    let retryTimer: number | undefined
    let onFocus: (() => void) | undefined
    let onVisibilityChange: (() => void) | undefined

    const initVoiceLayer = async () => {
      const service = window.nativeBridge?.assistantService
      if (service?.getStatus) {
        try {
          const status = await service.getStatus()
          if (status.enabled && status.listening) {
            // Main-process assistant service owns microphone in background mode.
            return
          }
        } catch {
          // Fallback to renderer listener when service status is unavailable.
        }
      }

      const wakeListeningKey = 'patrich.voiceWakeEnabled'
      if (localStorage.getItem(wakeListeningKey) === null) {
        localStorage.setItem(wakeListeningKey, '1')
      }

      if (localStorage.getItem(wakeListeningKey) !== '1') {
        return
      }

      voiceHandler.updateConfig({
        autoDetect: true,
        continuousMode: true,
      })

      const attemptStartListening = () => {
        const state = voiceHandler.getState()
        if (state.isListening) return
        const startResult = voiceHandler.startListening()
        if (!startResult.success) {
          setErrorMessage(startResult.message)
        }
      }

      // Keep wake listener alive while app is open.
      attemptStartListening()
      retryTimer = window.setInterval(attemptStartListening, 8000)
      onFocus = () => attemptStartListening()
      onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          attemptStartListening()
        }
      }

      window.addEventListener('focus', onFocus)
      document.addEventListener('visibilitychange', onVisibilityChange)

      if (service?.onEvent) {
        cleanup = service.onEvent((payload) => {
          if (payload.type === 'status' && payload.listening) {
            voiceHandler.stopListening()
          }
        })
      }
    }

    initVoiceLayer().catch(() => {})

    return () => {
      if (retryTimer !== undefined) {
        window.clearInterval(retryTimer)
      }
      if (onFocus) {
        window.removeEventListener('focus', onFocus)
      }
      if (onVisibilityChange) {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      if (cleanup) cleanup()
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('patrich.voiceMode', voiceMode)
  }, [voiceMode])

  useEffect(() => {
    return runtimeStatusStore.subscribe((status) => {
      setRuntimeStatus(status)
    })
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      upsertChatHistory(
        {
          id: historySessionId,
          messages,
          createdAt: historyCreatedAt,
          updatedAt: new Date(),
          agentId: 'main-agent',
        }
      )
    }, 150)

    return () => window.clearTimeout(timeout)
  }, [historySessionId, historyCreatedAt, messages])

  const handleNewChat = () => {
    const nextHistory = createChatHistorySession([initialMessage])
    setHistorySessionId(nextHistory.id)
    setHistoryCreatedAt(nextHistory.createdAt)
    setMessages([initialMessage])
    setCurrentTask(null)
    setIsProcessing(false)
    setActiveAgentName('Main Agent')
    setErrorMessage('')
    setCurrentMood('casual')
  }

  const summarizeTaskOutcome = (completedTask: Task): string => {
    const result = completedTask.result

    if (typeof result === 'string' && result.trim()) {
      return result.trim()
    }

    if (result && typeof result === 'object') {
      const record = result as Record<string, unknown>

      if (typeof record.message === 'string' && record.message.trim()) {
        return record.message.trim()
      }

      if (typeof record.output === 'string' && record.output.trim()) {
        return record.output.trim()
      }

      if (record.success === true) {
        return 'Task completed.'
      }
    }

    return completedTask.status === 'completed'
      ? 'Task completed.'
      : completedTask.error || 'Task not completed.'
  }

  const getCasualReply = (input: string): string | null => {
    const normalized = input.trim().toLowerCase()
    const knownName = memoryEngine.get('user_name') || 'Paras'

    if (/^(hi|hello|hey|yo|sup|good\s*(morning|afternoon|evening|night))\b/.test(normalized)) {
      return 'Hey! I am here. What do you want me to do?'
    }

    if (/(do\s+u\s+know\s+my\s+name|do\s+you\s+know\s+my\s+name|what\s+is\s+my\s+name|who\s+am\s+i)/.test(normalized)) {
      return `Yes. Your name is ${knownName}.`
    }

    if (/(who\s+are\s+you|what\s+are\s+you)/.test(normalized)) {
      return 'I am Patrich, your personal sovereign companion. I can chat naturally and execute tasks when you ask.'
    }

    if (/^(thanks|thank you|thx)\b/.test(normalized)) {
      return 'Anytime. Ready when you are.'
    }

    return null
  }

  const shouldExecuteTask = (
    parsed: { intent: string; action: string; confidence: number },
    text: string,
  ): boolean => {
    const normalized = text.trim().toLowerCase()
    const explicitCommandCue = /^(open|launch|send|message|msg|call|dial|enable|disable|sync|learn|resume|pause|stop)\b/.test(
      normalized,
    )

    // Keep default behavior chat-first: low-confidence requests stay conversational.
    if (parsed.confidence < 0.8 && !explicitCommandCue) {
      return false
    }

    if (parsed.intent === 'app_launch' || parsed.intent === 'message' || parsed.intent === 'call') {
      return true
    }

    if (parsed.intent === 'multi_action') {
      return true
    }

    const executableQueryActions = new Set([
      'enable_assistive_mode',
      'disable_assistive_mode',
      'open_and_send',
      'open_and_control',
      'close_app',
      'web_search',
      'system_control',
      'media_control',
      'file_operation',
      'browser_snapshot',
      'desktop_ref_click',
      'desktop_ref_type',
      'platform_capability_report',
      'set_daily_briefing_time',
      'set_one_time_briefing',
      'clear_one_time_briefing',
      'arm_emergency_override',
      'emergency_stop_automation',
      'clear_emergency_stop',
      'sync_installed_apps',
      'learn_current_app',
      'memory_remember',
      'memory_recall',
      'memory_list',
    ])

    return executableQueryActions.has(parsed.action)
  }

  const isAffirmative = (text: string): boolean => /^(yes|yep|yeah|confirm|do it|go ahead|sure|ok|okay)$/i.test(text.trim())

  const isNegative = (text: string): boolean => /^(no|nope|cancel|stop|not now|don't)$/i.test(text.trim())

  const buildClarificationPrompt = (
    parsed: { intent: string; action: string; parameters: Record<string, unknown> },
    text: string,
  ): string => {
    if (parsed.action === 'launch_app') {
      const app = String(parsed.parameters.app || '').trim()
      if (!app) {
        return 'I detected an app-launch request but not the app name clearly. Which app should I open?'
      }
      return `Just to confirm: should I open ${app}? Reply yes or no.`
    }

    if (parsed.action === 'send_message') {
      const recipient = String(parsed.parameters.recipient || '').trim()
      return recipient
        ? `Confirm sending this message to ${recipient}? Reply yes or no.`
        : 'I detected a message request but the recipient is unclear. Who should I message?'
    }

    return `I interpreted this as an executable command: "${text}". Confirm execution? Reply yes or no.`
  }

  const needsClarification = (
    parsed: { intent: string; action: string; confidence: number; parameters: Record<string, unknown> },
    text: string,
  ): boolean => {
    if (parsed.action === 'launch_app' && !String(parsed.parameters.app || '').trim()) {
      return true
    }

    const explicitCommandCue = /^(open|launch|send|message|msg|call|dial|enable|disable|sync|learn|remember|save|resume|pause|stop)\b/i.test(
      text.trim(),
    )

    return explicitCommandCue && parsed.confidence < 0.9
  }

  const executeParsedTask = (
    parsed: { intent: string; action: string; confidence: number; subAgentRequired: boolean; parameters: Record<string, unknown> },
    fromVoice = false,
  ): void => {
    // Human-style transition message before execution.
    setMessages((prev: Message[]) => [
      ...prev,
      {
        id: `msg-${Date.now()}-exec-start`,
        type: 'agent',
        content: 'Got it. Working on that now.',
        timestamp: new Date(),
      },
    ])

    const task = taskExecutor.createTask(parsed)
    setCurrentTask(task)

    if (parsed.subAgentRequired) {
      const subAgent = agentEngine.createSubAgent('main-agent', parsed.intent, [
        'task_execution',
        parsed.action,
      ])
      setActiveAgentName(subAgent.name)
    } else {
      setActiveAgentName(agentEngine.getAllAgents()[0]?.name || 'Main Agent')
    }

    taskExecutor
      .executeTask(task, {
        userId: 'user-1',
        agentId: 'main-agent',
        taskId: task.id,
        device: 'desktop',
        platform: 'windows',
      })
      .then((completedTask) => {
        const completionMessage: Message = {
          id: `msg-${Date.now()}-complete`,
          type: 'agent',
          content: completedTask.status === 'completed'
            ? `✅ Done. ${summarizeTaskOutcome(completedTask)}`
            : `❌ Not done: ${summarizeTaskOutcome(completedTask)}`,
          timestamp: new Date(),
          metadata: { taskId: completedTask.id },
        }

        setMessages((prev: Message[]) => [...prev, completionMessage])
        speakIfNeeded(completionMessage.content, fromVoice)
      })
      .catch((error: unknown) => {
        const failureMessage = error instanceof Error ? error.message : 'Execution failed.'
        setErrorMessage(failureMessage)

        setMessages((prev: Message[]) => [
          ...prev,
          {
            id: `msg-${Date.now()}-error`,
            type: 'agent',
            content: `❌ ${failureMessage}`,
            timestamp: new Date(),
            metadata: { taskId: task.id },
          },
        ])
        speakIfNeeded(`Execution failed. ${failureMessage}`, fromVoice)
      })
      .finally(() => {
        setActiveAgentName('Main Agent')
        setIsProcessing(false)
        setCurrentTask(null)
      })
  }

  const handleSlashCommand = (text: string): boolean => {
    const normalized = text.trim().toLowerCase()
    if (!normalized.startsWith('/')) return false

    if (normalized === '/help') {
      setMessages((prev: Message[]) => [
        ...prev,
        {
          id: `msg-${Date.now()}-help`,
          type: 'agent',
          content:
            'Available commands: /help, /new, /settings. For tasks, just type naturally (example: open whatsapp).',
          timestamp: new Date(),
        },
      ])
      return true
    }

    if (normalized === '/new') {
      handleNewChat()
      return true
    }

    if (normalized === '/settings') {
      setIsSettingsOpen(true)
      return true
    }

    // OpenJarvis-style fallback: unknown slash commands fall through to normal chat.
    return false
  }

  const speakIfNeeded = (text: string, fromVoice: boolean): void => {
    if (!fromVoice || voiceMode !== 'talking') return
    localVoiceRuntime.speak(text).catch(() => {})
  }

  const respondAsNormalChat = async (text: string, fromVoice = false): Promise<void> => {
    const casualReply = getCasualReply(text)
    if (casualReply) {
      setMessages((prev: Message[]) => [
        ...prev,
        {
          id: `msg-${Date.now()}-chat`,
          type: 'agent',
          content: casualReply,
          timestamp: new Date(),
        },
      ])
      speakIfNeeded(casualReply, fromVoice)
      return
    }

    const friendContext = memoryEngine.buildFriendContext()
    const chatPrompt = `User: "${text}"\n\nReply naturally as a helpful personal AI companion. Keep it short, clear, and human. If asked about name/memory, answer based on known context.`

    const response = await intelligenceRouter.query(chatPrompt, {
      systemPrompt: friendContext,
      urgency: 'normal',
      taskType: 'chat',
    })

    setMessages((prev: Message[]) => [
      ...prev,
      {
        id: `msg-${Date.now()}-chat-ai`,
        type: 'agent',
        content: response.content || 'I am here with you. Tell me what you need.',
        timestamp: new Date(),
      },
    ])
    speakIfNeeded(response.content || 'I am here with you. Tell me what you need.', fromVoice)
  }

  const handleSendMessage = (text: string, fromVoice = false): void => {
    if (!text.trim()) return

    setErrorMessage('')

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      type: 'user',
      content: text,
      timestamp: new Date(),
      metadata: { voiceInput: fromVoice },
    }

    setMessages((prev: Message[]) => [...prev, userMessage])
    memoryTierService.remember(`msg_${Date.now()}`, text, 'chat').catch(() => {})
    setInputValue('')
    setIsProcessing(true)

    // Analyze message for mood only; keep the chat output factual.
    memoryEngine.analyzeMessage(text).then(({ mood }) => {
      setCurrentMood(mood)
    }).catch(() => {})

    // 💾 Persist message to Supabase (async)
    db.tasks.log({ command: text, intent: 'chat', status: 'sent' }).catch(() => {})

    const modeCommand = text.trim().toLowerCase()
    if (/^(silent\s*mode|be\s*silent|silent)$/.test(modeCommand)) {
      setVoiceMode('silent')
      setMessages((prev: Message[]) => [
        ...prev,
        {
          id: `msg-${Date.now()}-voice-mode-silent`,
          type: 'agent',
          content: 'Silent mode enabled. I will keep listening, but I will not speak out loud.',
          timestamp: new Date(),
        },
      ])
      setIsProcessing(false)
      return
    }

    if (/^(talking\s*mode|speak\s*mode|talking|speak)$/.test(modeCommand)) {
      setVoiceMode('talking')
      const ack = 'Talking mode enabled. I will listen and reply with voice for voice commands.'
      setMessages((prev: Message[]) => [
        ...prev,
        {
          id: `msg-${Date.now()}-voice-mode-talking`,
          type: 'agent',
          content: ack,
          timestamp: new Date(),
        },
      ])
      if (fromVoice) {
        localVoiceRuntime.speak(ack).catch(() => {})
      }
      setIsProcessing(false)
      return
    }

    // Process command
    if (pendingExecution) {
      if (isAffirmative(text)) {
        const queued = pendingExecution
        setPendingExecution(null)
        executeParsedTask(queued.parsed, queued.fromVoice)
        return
      }

      if (isNegative(text)) {
        setPendingExecution(null)
        setMessages((prev: Message[]) => [
          ...prev,
          {
            id: `msg-${Date.now()}-cancelled` ,
            type: 'agent',
            content: 'Okay, cancelled that action.',
            timestamp: new Date(),
          },
        ])
        setIsProcessing(false)
        return
      }
    }

    const parsed = taskExecutor.parseCommand(text)

    if (handleSlashCommand(text)) {
      setIsProcessing(false)
      return
    }

    if (!shouldExecuteTask(parsed, text)) {
      respondAsNormalChat(text, fromVoice)
        .catch(() => {
          const fallbackReply = 'I could not process that deeply right now, but I am here. Ask me again in a different way.'
          setMessages((prev: Message[]) => [
            ...prev,
            {
              id: `msg-${Date.now()}-chat-fallback`,
              type: 'agent',
              content: fallbackReply,
              timestamp: new Date(),
            },
          ])
          speakIfNeeded(fallbackReply, fromVoice)
        })
        .finally(() => {
          setIsProcessing(false)
        })
      return
    }

    if (needsClarification(parsed, text)) {
      setPendingExecution({ parsed, originalText: text, fromVoice })
      setMessages((prev: Message[]) => [
        ...prev,
        {
          id: `msg-${Date.now()}-clarify`,
          type: 'agent',
          content: buildClarificationPrompt(parsed, text),
          timestamp: new Date(),
        },
      ])
      setIsProcessing(false)
      return
    }

    executeParsedTask(parsed, fromVoice)
  }

  const handleVoiceCommand = (command: string) => {
    const normalized = command.trim().toLowerCase()

    if (normalized === 'cancel') {
      if (pendingExecution) {
        setPendingExecution(null)
        setMessages((prev: Message[]) => [
          ...prev,
          {
            id: `msg-${Date.now()}-voice-cancelled`,
            type: 'agent',
            content: 'Cancelled the pending action.',
            timestamp: new Date(),
          },
        ])
      }
      setVoiceDraft('')
      return
    }

    handleSendMessage(command, true)
    setVoiceDraft('')
  }

  const handleVoiceError = (message: string) => {
    setErrorMessage(message)
  }

  const handleVoiceActivation = (): void => {
    const activationMessage: Message = {
      id: `msg-${Date.now()}-activation`,
      type: 'agent',
      content: 'Hey Paras! I\'m listening... 👂',
      timestamp: new Date(),
    }
    setMessages((prev: Message[]) => [...prev, activationMessage])
    if (voiceMode === 'talking') {
      localVoiceRuntime.speak('I am listening.').catch(() => {})
    }
  }

  const handleVoiceTranscript = (transcript: string, isFinal: boolean): void => {
    if (isFinal) {
      setVoiceDraft('')
      return
    }

    setVoiceDraft(transcript)
  }

  return (
    <div className={`chat-app-layout mood-${currentMood} device-${deviceClass}`}>
      <div className="chat-container">
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-title">
            <div className="main-title">Omni-Learning Assistant</div>
            <div className="chat-header-subtitle">{activeAgentName} | Local Engine</div>
            <div className="chat-header-subtitle">
              Runtime: {runtimeStatus.running ? 'online' : 'offline'} | mode: {runtimeStatus.activeMode} | queue: {runtimeStatus.queuedMessages}
            </div>
          </div>
          <div className="chat-header-controls">
            <button
              className="btn-secondary"
              title="Connect APIs"
              onClick={() => setIsAPIConfigOpen(true)}
            >
              🔗 Connect
            </button>
            <button className="btn-secondary" title="New Session" onClick={handleNewChat}>
              ➕ New
            </button>
            <button
              className="btn-secondary"
              title="Settings"
              onClick={() => setIsSettingsOpen(true)}
            >
              ⚙️
            </button>
            <VoiceButton
              onCommand={handleVoiceCommand}
              onActivation={handleVoiceActivation}
              onError={handleVoiceError}
              onTranscript={handleVoiceTranscript}
              mode={voiceMode}
              onModeChange={setVoiceMode}
            />
            <ThemeToggle isDark={isDark} onToggle={onThemeToggle} />
          </div>
        </div>

        <SettingsPanel open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

        {/* API Configuration Panel Modal */}
        {isAPIConfigOpen && (
          <div className="modal-overlay" onClick={() => setIsAPIConfigOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <APIConfigPanel onClose={() => setIsAPIConfigOpen(false)} />
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="messages-container">
          {messages.map((message: Message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {currentTask && <TaskDisplay task={currentTask as Task} />}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="input-container">
          <div className="input-stack">
            {errorMessage && <div className="error-banner">{errorMessage}</div>}
            {voiceDraft && <div className="error-banner">Listening: {voiceDraft}</div>}
            <input
              type="text"
              className="input-field"
              placeholder="Type your command... (e.g. 'Build a React dashboard', 'Make a video')"
              value={inputValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
              onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter' && !isProcessing) {
                  handleSendMessage(inputValue)
                }
              }}
              disabled={isProcessing}
            />
          </div>
        </div>
      </div>

    </div>
  )
}

export default ChatInterface
