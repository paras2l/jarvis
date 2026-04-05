import React, { useState, useRef, useEffect } from 'react'
import MessageBubble from './MessageBubble.tsx'
import TaskDisplay from './TaskDisplay.tsx'
import VoiceButton from './VoiceButton.tsx'
import ThemeToggle from './ThemeToggle.tsx'
import SettingsPanel from './SettingsPanel.tsx'
import LiveCanvas from './LiveCanvas.tsx'
import './ChatInterface.css'
import { Message, Task } from '@/types'
import agentEngine from '@/core/agent-engine'
import {
  createChatHistorySession,
  getLatestChatHistory,
  upsertChatHistory,
} from '@/core/chat-history'
import taskExecutor from '@/core/task-executor'

interface ChatInterfaceProps {
  isDark: boolean
  onThemeToggle: () => void
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  isDark,
  onThemeToggle,
}: ChatInterfaceProps) => {
  const initialMessage: Message = {
    id: 'init-1',
    type: 'agent',
    content: 'Hey Paras! 👋 I\'m your personal AI agent. How can I help you today?',
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
  const [isCanvasOpen, setIsCanvasOpen] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mainAgent = agentEngine.initializeMainAgent('user-1')
    setActiveAgentName(mainAgent.name)
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
  }

  const handleSendMessage = (text: string): void => {
    if (!text.trim()) return

    setErrorMessage('')

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      type: 'user',
      content: text,
      timestamp: new Date(),
      metadata: { voiceInput: false },
    }

    setMessages((prev: Message[]) => [...prev, userMessage])
    setInputValue('')
    setIsProcessing(true)

    // Process command
    const parsed = taskExecutor.parseCommand(text)
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

    const processingMessage: Message = {
      id: `msg-${Date.now()}-response`,
      type: 'agent',
      content: `Processing your request: ${parsed.action}`,
      timestamp: new Date(),
      metadata: { taskId: task.id },
    }

    setMessages((prev: Message[]) => [...prev, processingMessage])

    taskExecutor
      .executeTask(task, {
        userId: 'user-1',
        agentId: 'main-agent',
        taskId: task.id,
        device: 'desktop',
        platform: 'windows',
      })
      .then((completedTask) => {
        setCurrentTask({ ...completedTask })

        const taskResult = completedTask.result as { message?: string } | undefined
        const outcomeMessage =
          taskResult?.message || completedTask.error || 'Execution finished.'

        const completionMessage: Message = {
          id: `msg-${Date.now()}-complete`,
          type: 'agent',
          content: `${completedTask.status === 'completed' ? '✅' : '❌'} ${outcomeMessage}`,
          timestamp: new Date(),
          metadata: { taskId: completedTask.id },
        }

        setMessages((prev: Message[]) => [...prev, completionMessage])
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
      })
      .finally(() => {
        setActiveAgentName('Main Agent')
        setIsProcessing(false)
        setCurrentTask(null)
      })
  }

  const handleVoiceCommand = (command: string) => {
    handleSendMessage(command)
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
  }

  return (
    <div className={`chat-app-layout ${isCanvasOpen ? 'canvas-expanded' : ''}`}>
      <div className="chat-container">
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-title">
            <div className="main-title">Omni-Learning Assistant</div>
            <div className="chat-header-subtitle">{activeAgentName} | Local Engine</div>
          </div>
          <div className="chat-header-controls">
            <button className="btn-secondary" title="Connect Tools">
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
            <button 
              className={`btn-secondary ${isCanvasOpen ? 'btn-active' : ''}`} 
              title="Toggle Visual Brain" 
              onClick={() => setIsCanvasOpen(!isCanvasOpen)}
            >
              🖼️
            </button>
            <ThemeToggle isDark={isDark} onToggle={onThemeToggle} />
          </div>
        </div>

        <SettingsPanel open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

        {/* Messages */}
        <div className="messages-container">
          {messages.map((message: Message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {currentTask && <TaskDisplay task={currentTask} />}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="input-container">
          <div className="input-stack">
            {errorMessage && <div className="error-banner">{errorMessage}</div>}
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

            <VoiceButton
              onCommand={handleVoiceCommand}
              onActivation={handleVoiceActivation}
              onError={handleVoiceError}
            />

            <button
              className="send-button"
              onClick={() => handleSendMessage(inputValue)}
              disabled={isProcessing || !inputValue.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {isCanvasOpen && (
        <div className="canvas-sidebar">
          <LiveCanvas />
        </div>
      )}
    </div>
  )
}

export default ChatInterface
