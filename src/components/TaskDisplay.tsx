import React from 'react'
import { Task } from '@/types'

interface TaskDisplayProps {
  task: Task
}

const TaskDisplay: React.FC<TaskDisplayProps> = ({ task }) => {
  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'pending':
        return '⏳'
      case 'executing':
        return '🔄'
      case 'completed':
        return '✅'
      case 'failed':
        return '❌'
      default:
        return '📋'
    }
  }

  return (
    <div className="task-display">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>{getStatusIcon(task.status)}</span>
        <span className={`task-status ${task.status}`}>{task.status}</span>
      </div>
      <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
        {task.command}
      </p>
      {task.error && (
        <p style={{ color: '#f44336', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Error: {task.error}
        </p>
      )}
    </div>
  )
}

export default TaskDisplay
