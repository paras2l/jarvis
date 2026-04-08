import { SkillDefinition } from '@/core/skills/types'

function openMailto(to: string, subject = '', body = ''): string {
  const query = new URLSearchParams()
  if (subject) query.set('subject', subject)
  if (body) query.set('body', body)
  return `mailto:${to.trim()}${query.toString() ? `?${query.toString()}` : ''}`
}

export const sendEmailSkill: SkillDefinition = {
  id: 'builtin.send-email',
  name: 'Send Email',
  description: 'Prepares an email draft for the given recipient, subject, and message.',
  category: 'communication',
  tags: ['email', 'message', 'send', 'compose'],
  aliases: ['send mail', 'compose email', 'email'],
  version: '1.0.0',
  origin: 'builtin',
  enabled: true,
  permissions: ['open_external'],
  handler: async (input, _context, api) => {
    const payload = typeof input === 'string' ? { body: input } : (input as Record<string, unknown>)
    const recipient = String(payload?.to || payload?.recipient || '').trim()
    const subject = String(payload?.subject || 'Message from Pixi').trim()
    const body = String(payload?.body || payload?.message || '').trim()

    if (!recipient) {
      return {
        success: false,
        message: 'No email recipient was provided.',
      }
    }

    const mailto = openMailto(recipient, subject, body)
    const openResult = await api.openExternal(mailto)

    return {
      success: openResult.success,
      message: openResult.success
        ? `Opened an email draft for ${recipient}.`
        : openResult.message,
      data: {
        recipient,
        subject,
      },
    }
  },
}

