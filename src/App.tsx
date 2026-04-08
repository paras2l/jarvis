import { useState, useEffect } from 'react'
import { notificationEngine } from './core/notification-engine'
import { daemonManager } from './core/daemon-manager'
import ChatInterface from './components/ChatInterface'
import WebControlDashboard from './components/WebControlDashboard'
import { whisperEngine } from './voice/whisper-engine'
import { getWhisperConfig } from './voice/whisper-recognition'
import '@/styles/theme.css'
import '@/styles/globals.css'
import '@/styles/chat.css'

function App() {
  const [isDark, setIsDark] = useState(false)
  const dashboardMode = String(import.meta.env.VITE_APP_MODE || '').toLowerCase() === 'dashboard'

  const handleThemeToggle = () => {
    setIsDark((prev) => {
      const next = !prev
      document.documentElement.style.colorScheme = next ? 'dark' : 'light'
      if (next) {
        document.body.classList.add('dark')
      } else {
        document.body.classList.remove('dark')
      }
      return next
    })
  }

  useEffect(() => {
    // Request notification permissions for background partnership
    notificationEngine.requestPermission()
    daemonManager.start().catch((error) => {
      console.warn('[App] Daemon bootstrap failed:', error)
    })

    const whisper = getWhisperConfig()
    window.nativeBridge?.assistantService?.start?.({
      provider: 'native',
      whisperModel: whisper.model,
      whisperDevice: whisper.device,
    }).catch(() => {})
    whisperEngine.initialize().catch(() => {})

    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
    if (isDark) {
      document.body.classList.add('dark')
    } else {
      document.body.classList.remove('dark')
    }
  }, [isDark])

  return (
    dashboardMode
      ? <WebControlDashboard />
      : <ChatInterface isDark={isDark} onThemeToggle={handleThemeToggle} />
  )
}

export default App
