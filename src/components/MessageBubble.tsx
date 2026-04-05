import React from 'react'
import { Message } from '@/types'

interface MessageBubbleProps {
  message: Message
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.type === 'user'

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  return (
    <div className={`message ${isUser ? 'user' : 'agent'}`}>
      <div className="message-bubble">
        <p>{message.content}</p>
        <div className="message-time">{formatTime(message.timestamp)}</div>
      </div>
    </div>
  )
}

export default MessageBubble
