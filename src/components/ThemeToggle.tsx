import React from 'react'

interface ThemeToggleProps {
  isDark: boolean
  onToggle: () => void
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ isDark, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      className="btn-secondary"
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      style={{
        padding: '0.5rem 0.75rem',
        minWidth: 'auto',
      }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  )
}

export default ThemeToggle
