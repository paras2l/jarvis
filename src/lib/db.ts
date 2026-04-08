/**
 * Omni-Learning Agent â€” Database Layer
 * =====================================
 * All CRUD operations for every table in the Supabase schema.
 * Uses anon client only. Privileged writes must run in server/worker functions.
 */

import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, STORAGE_BUCKET, DEFAULT_USER } from './supabase'

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TYPES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AgentMemory {
  id?: string
  user_tag?: string
  memory_type: 'habit' | 'preference' | 'mood_pattern' | 'fact' | 'goal'
  key: string
  value: string
  confidence?: number
  last_seen?: string
}

export interface ChatSession {
  id?: string
  user_tag?: string
  title?: string
  message_count?: number
}

export interface ChatMessage {
  id?: string
  session_id: string
  role: 'user' | 'agent' | 'system'
  content: string
  metadata?: Record<string, unknown>
}

export interface MediaJobRecord {
  id?: string
  user_tag?: string
  prompt: string
  mode?: string
  quality?: string
  status?: string
  stage_order?: string[]
  retry_count?: number
  error?: string
  completed_at?: string
}

export interface MediaStageRecord {
  id?: string
  job_id: string
  stage_type: string
  runtime?: string
  status?: string
  prompt?: string
  artifact_url?: string
  model_version?: string
  duration_ms?: number
  error?: string
}

export interface MoodEntry {
  user_tag?: string
  mood?: string
  energy?: number
  detected_from?: string
  recommendations?: unknown[]
}

export interface TaskEntry {
  user_tag?: string
  command: string
  intent?: string
  status?: string
  result?: Record<string, unknown>
  duration_ms?: number
}

export interface GpuJobQueueRecord {
  id: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  result_url?: string | null
  error?: string | null
  retry_count?: number | null
  max_retries?: number | null
  worker_id?: string | null
  updated_at?: string | null
  last_heartbeat_at?: string | null
  dead_lettered_at?: string | null
}

export interface NotificationRecord {
  id?: string
  user_tag?: string
  app_name: string
  sender?: string | null
  content: string
  importance?: 'info' | 'high' | 'critical'
  source_device?: string | null
  metadata?: Record<string, unknown>
  announced?: boolean
  processed_summary?: string | null
  processed_at?: string | null
  created_at?: string
}

export interface PixiSettings {
  user_tag?: string
  sensitivity?: 'shy' | 'partner' | 'chatty'
  focus_filtering?: boolean
  voice_announcements?: boolean
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
  updated_at?: string
}

export interface CuriosityRunRecord {
  id?: string
  user_tag?: string
  topic: string
  insight: string
  source_url?: string | null
  delivered?: boolean
  delivered_at?: string | null
  created_at?: string
}

export interface ProtocolStatusRecord {
  id: string
  name: string
  status: 'offline' | 'connecting' | 'online' | 'error'
  last_active?: string
  metadata?: Record<string, unknown>
}

export interface AuditEntryRecord {
  id?: string
  user_tag?: string
  event_type: string
  plugin_id?: string
  action_id?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  created_at?: string
}

export interface AkashaArchiveRecord {
  id?: string
  user_tag?: string
  source_type: string
  original_content: string
  compressed_summary: string
  vector_id?: string
  created_at?: string
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// USER PROFILE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const db = {
  profile: {
    async get(userTag = DEFAULT_USER) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_tag', userTag)
        .maybeSingle()
      if (error) console.error('[db.profile.get]', error.message)
      return data
    },

    async upsert(updates: Record<string, unknown>, userTag = DEFAULT_USER) {
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert({ user_tag: userTag, ...updates }, { onConflict: 'user_tag' })
        .select()
        .single()
      if (error) console.error('[db.profile.upsert]', error.message)
      return data
    },
  },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // AGENT MEMORY (Long-term personality + preferences)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  memory: {
    async getAll(userTag = DEFAULT_USER) {
      const { data, error } = await supabase
        .from('agent_memory')
        .select('*')
        .eq('user_tag', userTag)
        .order('last_seen', { ascending: false })
      if (error) console.error('[db.memory.getAll]', error.message)
      return data ?? []
    },

    async get(key: string, userTag = DEFAULT_USER) {
      const { data } = await supabase
        .from('agent_memory')
        .select('value, confidence')
        .eq('user_tag', userTag)
        .eq('key', key)
        .maybeSingle()
      return data?.value ?? null
    },

    async upsert(memory: AgentMemory, userTag = DEFAULT_USER) {
      const { error } = await supabase
        .from('agent_memory')
        .upsert(
          { user_tag: userTag, ...memory, last_seen: new Date().toISOString() },
          { onConflict: 'user_tag,key' } as never
        )
      if (error) console.error('[db.memory.upsert]', error.message)
    },

    async delete(key: string, userTag = DEFAULT_USER) {
      const { error } = await supabase
        .from('agent_memory')
        .delete()
        .eq('user_tag', userTag)
        .eq('key', key)
      if (error) console.error('[db.memory.delete]', error.message)
    },
  },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // CHAT HISTORY
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  chat: {
    async createSession(title?: string, userTag = DEFAULT_USER) {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({ user_tag: userTag, title: title ?? `Chat ${new Date().toLocaleDateString()}` })
        .select()
        .single()
      if (error) console.error('[db.chat.createSession]', error.message)
      return data
    },

    async getSessions(userTag = DEFAULT_USER, limit = 20) {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_tag', userTag)
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (error) console.error('[db.chat.getSessions]', error.message)
      return data ?? []
    },

    async addMessage(msg: ChatMessage) {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert(msg)
        .select()
        .single()
      if (error) console.error('[db.chat.addMessage]', error.message)
      // Update session message count
      if (data) {
        await supabase.rpc('increment_message_count' as never, {
          session_id: msg.session_id,
        }).then(() => {}) // best effort
      }
      return data
    },

    async getMessages(sessionId: string, limit = 100) {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(limit)
      if (error) console.error('[db.chat.getMessages]', error.message)
      return data ?? []
    },
  },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // MEDIA JOBS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  media: {
    async createJob(job: MediaJobRecord): Promise<string | null> {
      const { data, error } = await supabase
        .from('media_jobs')
        .insert({ user_tag: DEFAULT_USER, ...job })
        .select('id')
        .single()
      if (error) console.error('[db.media.createJob]', error.message)
      return data?.id ?? null
    },

    async updateJob(jobId: string, updates: Partial<MediaJobRecord>) {
      const { error } = await supabase
        .from('media_jobs')
        .update(updates)
        .eq('id', jobId)
      if (error) console.error('[db.media.updateJob]', error.message)
    },

    async addStage(stage: MediaStageRecord) {
      const { data, error } = await supabase
        .from('media_stages')
        .insert(stage)
        .select('id')
        .single()
      if (error) console.error('[db.media.addStage]', error.message)
      return data?.id ?? null
    },

    async updateStage(stageId: string, updates: Partial<MediaStageRecord>) {
      const { error } = await supabase
        .from('media_stages')
        .update(updates)
        .eq('id', stageId)
      if (error) console.error('[db.media.updateStage]', error.message)
    },

    async getRecentJobs(userTag = DEFAULT_USER, limit = 20) {
      const { data, error } = await supabase
        .from('media_jobs')
        .select('*, media_stages(*)')
        .eq('user_tag', userTag)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) console.error('[db.media.getRecentJobs]', error.message)
      return data ?? []
    },

    async queueGpuJob(payload: {
      mediaJobId: string
      stageType: string
      prompt: string
      inputUrls?: string[]
      modelName?: string
      maxRetries?: number
    }) {
      const defaultModelName = payload.stageType === 'video'
        ? 'wan-v1'
        : payload.stageType === 'avatar'
          ? 'liveportrait-hq-v1'
          : payload.stageType === 'voice'
            ? 'xtts-cloud-v1'
            : 'sdxl-turbo'

      const { data, error } = await supabase
        .from('gpu_job_queue')
        .insert({
          media_job_id: payload.mediaJobId,
          stage_type: payload.stageType,
          prompt: payload.prompt,
          input_urls: payload.inputUrls ?? [],
          model_name: payload.modelName ?? defaultModelName,
          status: 'queued',
          retry_count: 0,
          max_retries: payload.maxRetries ?? 3,
          dead_lettered_at: null,
          worker_id: null,
          last_heartbeat_at: null,
        })
        .select('id')
        .single()
      if (error) console.error('[db.media.queueGpuJob]', error.message)
      return data?.id ?? null
    },

    async pollGpuJob(gpuJobId: string): Promise<GpuJobQueueRecord | null> {
      const { data, error } = await supabase
        .from('gpu_job_queue')
        .select('id, status, result_url, error, retry_count, max_retries, worker_id, updated_at, last_heartbeat_at, dead_lettered_at')
        .eq('id', gpuJobId)
        .single()
      if (error) console.error('[db.media.pollGpuJob]', error.message)
      return (data as GpuJobQueueRecord | null) ?? null
    },

    async heartbeatGpuJob(gpuJobId: string, workerId: string) {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('gpu_job_queue')
        .update({
          worker_id: workerId,
          last_heartbeat_at: now,
          updated_at: now,
        })
        .eq('id', gpuJobId)
      if (error) console.error('[db.media.heartbeatGpuJob]', error.message)
    },

    async retryGpuJobOrDeadLetter(gpuJobId: string, reason: string): Promise<{ retried: boolean; deadLettered: boolean; retryCount: number; maxRetries: number }> {
      const current = await this.pollGpuJob(gpuJobId)
      const retryCount = current?.retry_count ?? 0
      const maxRetries = current?.max_retries ?? 3
      const nextRetryCount = retryCount + 1

      if (nextRetryCount <= maxRetries) {
        const { error } = await supabase
          .from('gpu_job_queue')
          .update({
            status: 'queued',
            retry_count: nextRetryCount,
            error: reason,
            worker_id: null,
          })
          .eq('id', gpuJobId)
        if (error) console.error('[db.media.retryGpuJobOrDeadLetter][retry]', error.message)
        return {
          retried: !error,
          deadLettered: false,
          retryCount: nextRetryCount,
          maxRetries,
        }
      }

      const { error } = await supabase
        .from('gpu_job_queue')
        .update({
          status: 'failed',
          retry_count: nextRetryCount,
          error: `Dead-lettered: ${reason}`,
          dead_lettered_at: new Date().toISOString(),
        })
        .eq('id', gpuJobId)
      if (error) console.error('[db.media.retryGpuJobOrDeadLetter][deadletter]', error.message)

      return {
        retried: false,
        deadLettered: !error,
        retryCount: nextRetryCount,
        maxRetries,
      }
    },

    async recoverStaleGpuJobs(staleAfterMinutes = 10): Promise<number> {
      const staleCutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('gpu_job_queue')
        .select('id')
        .in('status', ['queued', 'processing'])
        .lt('updated_at', staleCutoff)
        .limit(100)

      if (error) {
        console.error('[db.media.recoverStaleGpuJobs][select]', error.message)
        return 0
      }

      const staleRows = (data ?? []) as Array<{ id: string }>
      let recovered = 0
      for (const row of staleRows) {
        const outcome = await this.retryGpuJobOrDeadLetter(
          row.id,
          `Stale job recovered after ${staleAfterMinutes}m without updates.`,
        )
        if (outcome.retried || outcome.deadLettered) recovered += 1
      }
      return recovered
    },
  },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // STORAGE (Upload generated files to Supabase Storage)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  storage: {
    async uploadFromLocalPath(
      localFilePath: string,
      fileName: string,
      contentType = 'video/mp4'
    ): Promise<string | null> {
      // Only works in Electron context where we can read files
      if (typeof window === 'undefined' || !window.nativeBridge?.readFileBase64) {
        console.warn('[db.storage.upload] No native bridge for binary reading.')
        return null
      }
      try {
        const readResult = await window.nativeBridge.readFileBase64(localFilePath)
        if (!readResult?.success || !readResult.content) return null

        // Convert base64 to Blob
        const byteCharacters = atob(readResult.content)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: contentType })

        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(fileName, blob, { contentType, upsert: true })

        if (error) {
          console.error('[db.storage.upload]', error.message)
          return null
        }

        const { data: urlData } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(data.path)
        return urlData.publicUrl
      } catch (e) {
        console.error('[db.storage.upload] Error:', e)
        return null
      }
    },

    getPublicUrl(path: string): string {
      const { data } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(path)
      return data.publicUrl
    },
  },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // MOOD LOG
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  mood: {
    async log(entry: MoodEntry) {
      const { error } = await supabase
        .from('mood_log')
        .insert({ user_tag: DEFAULT_USER, ...entry })
      if (error) console.error('[db.mood.log]', error.message)
    },

    async getRecent(userTag = DEFAULT_USER, limit = 10) {
      const { data } = await supabase
        .from('mood_log')
        .select('*')
        .eq('user_tag', userTag)
        .order('created_at', { ascending: false })
        .limit(limit)
      return data ?? []
    },
  },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TASK HISTORY
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  tasks: {
    async log(entry: TaskEntry) {
      const { error } = await supabase
        .from('task_history')
        .insert({ user_tag: DEFAULT_USER, ...entry })
      if (error) console.error('[db.tasks.log]', error.message)
    },

    async getRecent(limit = 50, userTag = DEFAULT_USER) {
      const { data } = await supabase
        .from('task_history')
        .select('*')
        .eq('user_tag', userTag)
        .order('created_at', { ascending: false })
        .limit(limit)
      return data ?? []
    },
  },

  workers: {
    async heartbeat(workerId: string, status = 'online', metadata?: Record<string, unknown>) {
      const { error } = await supabase
        .from('gpu_worker_heartbeats')
        .insert({
          worker_id: workerId,
          status,
          metadata: metadata ?? {},
          updated_at: new Date().toISOString(),
        })
      if (error) console.error('[db.workers.heartbeat]', error.message)
    },
  },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // PHASE 9 â€” HUMANOID PROACTIVE DATA
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  notifications: {
    async ingest(notification: NotificationRecord, userTag = DEFAULT_USER): Promise<NotificationRecord | null> {
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          user_tag: userTag,
          app_name: notification.app_name,
          sender: notification.sender ?? null,
          content: notification.content,
          importance: notification.importance ?? 'info',
          source_device: notification.source_device ?? null,
          metadata: notification.metadata ?? {},
        })
        .select('*')
        .single()
      if (error) console.error('[db.notifications.ingest]', error.message)
      return (data as NotificationRecord | null) ?? null
    },

    async getById(notificationId: string, userTag = DEFAULT_USER): Promise<NotificationRecord | null> {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('id', notificationId)
        .eq('user_tag', userTag)
        .maybeSingle()
      if (error) console.error('[db.notifications.getById]', error.message)
      return (data as NotificationRecord | null) ?? null
    },

    async listPending(limit = 20, userTag = DEFAULT_USER): Promise<NotificationRecord[]> {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_tag', userTag)
        .eq('announced', false)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) console.error('[db.notifications.listPending]', error.message)
      return (data as NotificationRecord[] | null) ?? []
    },

    async markAnnounced(notificationId: string, summary?: string, userTag = DEFAULT_USER): Promise<boolean> {
      const { error } = await supabase
        .from('notifications')
        .update({
          announced: true,
          processed_summary: summary ?? null,
          processed_at: new Date().toISOString(),
        })
        .eq('id', notificationId)
        .eq('user_tag', userTag)
      if (error) {
        console.error('[db.notifications.markAnnounced]', error.message)
        return false
      }
      return true
    },

    async shouldDeliver(appName: string, importance: 'info' | 'high' | 'critical', userTag = DEFAULT_USER): Promise<boolean> {
      if (importance === 'critical') return true

      const { data, error } = await supabase.rpc('should_deliver_notification' as never, {
        p_user_tag: userTag,
        p_app_name: appName,
        p_importance: importance,
      })

      if (error) {
        console.error('[db.notifications.shouldDeliver]', error.message)
        const localFallback = await db.quietApps.isQuiet(appName, userTag)
        return !localFallback
      }

      return Boolean(data)
    },

    subscribe(
      onInsert: (notification: NotificationRecord) => void,
      userTag = DEFAULT_USER,
    ): RealtimeChannel {
      return supabase
        .channel(`notifications-${userTag}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_tag=eq.${userTag}`,
          },
          (payload) => {
            const inserted = payload.new as NotificationRecord
            onInsert(inserted)
          },
        )
        .subscribe()
    },
  },

  quietApps: {
    async list(userTag = DEFAULT_USER): Promise<Array<{ app_name: string; muted_until: string | null; reason: string | null }>> {
      const { data, error } = await supabase
        .from('quiet_apps')
        .select('app_name, muted_until, reason')
        .eq('user_tag', userTag)
      if (error) {
        console.error('[db.quietApps.list]', error.message)
        return []
      }
      return data ?? []
    },

    async upsert(appName: string, mutedUntil: string | null, reason?: string, userTag = DEFAULT_USER): Promise<boolean> {
      const { error } = await supabase
        .from('quiet_apps')
        .upsert(
          {
            user_tag: userTag,
            app_name: appName.toLowerCase(),
            muted_until: mutedUntil,
            reason: reason ?? null,
          },
          { onConflict: 'user_tag,app_name' } as never,
        )
      if (error) {
        console.error('[db.quietApps.upsert]', error.message)
        return false
      }
      return true
    },

    async remove(appName: string, userTag = DEFAULT_USER): Promise<boolean> {
      const { error } = await supabase
        .from('quiet_apps')
        .delete()
        .eq('user_tag', userTag)
        .eq('app_name', appName.toLowerCase())
      if (error) {
        console.error('[db.quietApps.remove]', error.message)
        return false
      }
      return true
    },

    async isQuiet(appName: string, userTag = DEFAULT_USER): Promise<boolean> {
      const { data, error } = await supabase
        .from('quiet_apps')
        .select('muted_until')
        .eq('user_tag', userTag)
        .eq('app_name', appName.toLowerCase())
        .maybeSingle()

      if (error || !data) return false
      if (!data.muted_until) return true
      return new Date(data.muted_until).getTime() > Date.now()
    },
  },

  settings: {
    async get(userTag = DEFAULT_USER): Promise<PixiSettings | null> {
      const { data, error } = await supabase
        .from('Pixi_settings')
        .select('*')
        .eq('user_tag', userTag)
        .maybeSingle()
      if (error) {
        console.error('[db.settings.get]', error.message)
        return null
      }
      return (data as PixiSettings | null) ?? null
    },

    async upsert(updates: Partial<PixiSettings>, userTag = DEFAULT_USER): Promise<PixiSettings | null> {
      const { data, error } = await supabase
        .from('Pixi_settings')
        .upsert(
          {
            user_tag: userTag,
            ...updates,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_tag' },
        )
        .select('*')
        .single()
      if (error) {
        console.error('[db.settings.upsert]', error.message)
        return null
      }
      return (data as PixiSettings | null) ?? null
    },
  },

  curiosity: {
    async logRun(topic: string, insight: string, sourceUrl?: string, userTag = DEFAULT_USER): Promise<CuriosityRunRecord | null> {
      const { data, error } = await supabase
        .from('curiosity_runs')
        .insert({
          user_tag: userTag,
          topic,
          insight,
          source_url: sourceUrl ?? null,
        })
        .select('*')
        .single()
      if (error) {
        console.error('[db.curiosity.logRun]', error.message)
        return null
      }
      return (data as CuriosityRunRecord | null) ?? null
    },

    async hasRunToday(topic: string, userTag = DEFAULT_USER): Promise<boolean> {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)

      const { data, error } = await supabase
        .from('curiosity_runs')
        .select('id')
        .eq('user_tag', userTag)
        .ilike('topic', topic)
        .gte('created_at', startOfDay.toISOString())
        .limit(1)
      if (error) {
        console.error('[db.curiosity.hasRunToday]', error.message)
        return false
      }
      return (data ?? []).length > 0
    },

    async getRecent(limit = 10, userTag = DEFAULT_USER): Promise<CuriosityRunRecord[]> {
      const { data, error } = await supabase
        .from('curiosity_runs')
        .select('*')
        .eq('user_tag', userTag)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) {
        console.error('[db.curiosity.getRecent]', error.message)
        return []
      }
      return (data as CuriosityRunRecord[] | null) ?? []
    },
  },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // APP SKILLS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  skills: {
    async upsert(id: string, platform: string, skillData: unknown, userTag = DEFAULT_USER) {
      const { error } = await supabase
        .from('app_skills')
        .upsert(
          { id, user_tag: userTag, app_name: 'auton_synthesized', platform, skill_data: skillData, last_used: new Date().toISOString() },
          { onConflict: 'id' }
        )
      if (error) console.error('[db.skills.upsert]', error.message)
    },

    async save(appName: string, platform: string, skillData: unknown, userTag = DEFAULT_USER) {
      const { error } = await supabase
        .from('app_skills')
        .upsert(
          { user_tag: userTag, app_name: appName, platform, skill_data: skillData, last_used: new Date().toISOString() },
          { onConflict: 'user_tag,app_name,platform' } as never
        )
      if (error) console.error('[db.skills.save]', error.message)
    },

    async load(appName: string, platform: string, userTag = DEFAULT_USER) {
      const { data } = await supabase
        .from('app_skills')
        .select('skill_data, success_rate')
        .eq('user_tag', userTag)
        .eq('app_name', appName)
        .eq('platform', platform)
        .maybeSingle()
      return data?.skill_data ?? null
    },
  },

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // PROTOCOLS & GOVERNANCE
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  protocols: {
    async getAll() {
      const { data, error } = await supabase
        .from('protocol_status')
        .select('*')
      if (error) console.error('[db.protocols.getAll]', error.message)
      return data ?? []
    },

    async upsert(record: ProtocolStatusRecord) {
      const { error } = await supabase
        .from('protocol_status')
        .upsert({ ...record, last_active: new Date().toISOString() })
      if (error) console.error('[db.protocols.upsert]', error.message)
    }
  },

  audit: {
    async append(entry: AuditEntryRecord, userTag = DEFAULT_USER) {
      const { data, error } = await supabase
        .from('audit_ledger')
        .insert({ user_tag: userTag, ...entry })
        .select()
        .single()
      if (error) console.error('[db.audit.append]', error.message)
      return data
    },

    async getRecent(limit = 50, userTag = DEFAULT_USER) {
      const { data, error } = await supabase
        .from('audit_ledger')
        .select('*')
        .eq('user_tag', userTag)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) console.error('[db.audit.getRecent]', error.message)
      return data ?? []
    }
  },

  akasha: {
    async archive(entry: AkashaArchiveRecord, userTag = DEFAULT_USER) {
      const { data, error } = await supabase
        .from('akasha_archives')
        .insert({ user_tag: userTag, ...entry })
        .select()
        .single()
      if (error) console.error('[db.akasha.archive]', error.message)
      return data
    }
  }
}

