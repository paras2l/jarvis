import React, { useState } from 'react'
import ChatInterface from './components/ChatInterface'
import '@/styles/theme.css'
import '@/styles/globals.css'
import '@/styles/chat.css'

function App() {
  const [isDark, setIsDark] = useState(false)

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

  React.useEffect(() => {
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
    if (isDark) {
      document.body.classList.add('dark')
    } else {
      document.body.classList.remove('dark')
    }
  }, [isDark])

  return (
    <ChatInterface isDark={isDark} onThemeToggle={handleThemeToggle} />
  )
}

export default App
