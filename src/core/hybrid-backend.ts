import type { RealtimeChannel } from '@supabase/supabase-js'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { getDeviceMesh } from '@/core/device-mesh'
import taskExecutor from '@/core/task-executor'
import agentEngine from '@/core/agent-engine'
import type { Task } from '@/types'
import { cloudBridge } from '@/core/cloud-bridge'

type DeviceRecord = {
  device_id: string
  device_type: string
  online_status: string
  capabilities: string[]
  last_active: string
  platform?: string
  name?: string
}

type RemoteTaskRecord = {
  id: string
  command: string
  status: string
  target_device_id?: string | null
  source_device_id?: string | null
  result?: unknown
  error?: string | null
  created_at?: string
  updated_at?: string
}

type AgentLogLevel = 'info' | 'warn' | 'error'

export type WebDashboardSnapshot = {
  devices: DeviceRecord[]
  tasks: RemoteTaskRecord[]
  memories: Array<{ key: string; value: string; last_seen?: string }>
}

class HybridBackendCoordinator {
  private mesh = getDeviceMesh()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private taskChannel: RealtimeChannel | null = null
  private started = false

  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    await this.registerLocalDevice()
    this.startPresenceHeartbeat()
    await this.subscribeRemoteTasks()
  }

  async stop(): Promise<void> {
    this.started = false

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    if (this.taskChannel) {
      await supabase.removeChannel(this.taskChannel)
      this.taskChannel = null
    }

    await this.updateLocalPresence('offline')
  }

  async registerLocalDevice(): Promise<void> {
    const local = this.mesh.getLocalDevice()
    const payload: DeviceRecord = {
      device_id: local.id,
      device_type: local.type,
      online_status: local.status,
      capabilities: local.capabilities,
      last_active: new Date().toISOString(),
      platform: local.platform,
      name: local.name,
    }

    const { error } = await supabase
      .from('devices')
      .upsert(payload, { onConflict: 'device_id' })

    if (error) {
      console.warn('[HybridBackend] devices upsert skipped:', error.message)
    }
  }

  async queueRemoteCommand(command: string, targetDeviceId: string, sourceDeviceId?: string): Promise<boolean> {
    const local = this.mesh.getLocalDevice()
    const { error } = await supabase.from('tasks').insert({
      command,
      status: 'queued',
      target_device_id: targetDeviceId,
      source_device_id: sourceDeviceId || local.id,
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.warn('[HybridBackend] task queue insert failed:', error.message)
      return false
    }

    return true
  }

  async logAgentEvent(agentName: string, message: string, level: AgentLogLevel = 'info'): Promise<void> {
    const local = this.mesh.getLocalDevice()
    const { error } = await supabase.from('agent_logs').insert({
      agent_name: agentName,
      message,
      level,
      device_id: local.id,
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.warn('[HybridBackend] agent_logs insert skipped:', error.message)
    }
  }

  async storeMemory(key: string, value: string): Promise<void> {
    const now = new Date().toISOString()

    const { error } = await supabase.from('memories').upsert(
      {
        key,
        value,
        updated_at: now,
      },
      { onConflict: 'key' },
    )

    if (!error) return

    // Fallback to legacy memory table used by existing app paths.
    await db.memory.upsert({
      memory_type: 'fact',
      key,
      value,
      last_seen: now,
    })
  }

  async submitHeavyJob(input: {
    mediaJobId: string
    stageType: string
    prompt: string
    inputUrls?: string[]
    modelName?: string
  }): Promise<string | null> {
    return cloudBridge.submitGpuJob(input)
  }

  async getWebDashboardSnapshot(limit = 12): Promise<WebDashboardSnapshot> {
    const [devicesResult, tasksResult, memoriesResult] = await Promise.all([
      supabase
        .from('devices')
        .select('device_id, device_type, online_status, capabilities, last_active, platform, name')
        .order('last_active', { ascending: false })
        .limit(limit),
      supabase
        .from('tasks')
        .select('id, command, status, target_device_id, source_device_id, result, error, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('memories')
        .select('key, value, last_seen')
        .order('last_seen', { ascending: false })
        .limit(limit),
    ])

    const devices = devicesResult.error ? [] : (devicesResult.data as DeviceRecord[])
    const tasks = tasksResult.error ? [] : (tasksResult.data as RemoteTaskRecord[])

    const memories = memoriesResult.error
      ? (await db.memory.getAll()).slice(0, limit).map((m) => ({ key: m.key, value: m.value, last_seen: m.last_seen }))
      : ((memoriesResult.data as Array<{ key: string; value: string; last_seen?: string }>) || [])

    return { devices, tasks, memories }
  }

  private startPresenceHeartbeat(): void {
    if (this.heartbeatTimer) return

    this.heartbeatTimer = setInterval(() => {
      this.updateLocalPresence('online').catch(() => {})
    }, 20_000)
  }

  private async updateLocalPresence(status: 'online' | 'offline'): Promise<void> {
    const local = this.mesh.getLocalDevice()

    const { error } = await supabase
      .from('devices')
      .upsert(
        {
          device_id: local.id,
          device_type: local.type,
          online_status: status,
          capabilities: local.capabilities,
          last_active: new Date().toISOString(),
          platform: local.platform,
          name: local.name,
        },
        { onConflict: 'device_id' },
      )

    if (error) {
      console.warn('[HybridBackend] presence heartbeat skipped:', error.message)
    }
  }

  private async subscribeRemoteTasks(): Promise<void> {
    if (this.taskChannel) return
    const local = this.mesh.getLocalDevice()

    this.taskChannel = supabase
      .channel(`hybrid-task-inbox-${local.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tasks',
          filter: `target_device_id=eq.${local.id}`,
        },
        (payload) => {
          const row = payload.new as RemoteTaskRecord
          this.handleIncomingTask(row).catch((error) => {
            console.error('[HybridBackend] remote task handling failed:', error)
          })
        },
      )

    await this.taskChannel.subscribe()
  }

  private async handleIncomingTask(row: RemoteTaskRecord): Promise<void> {
    if (!row.id || !row.command) return

    await supabase
      .from('tasks')
      .update({ status: 'executing', updated_at: new Date().toISOString() })
      .eq('id', row.id)

    try {
      const parsed = taskExecutor.parseCommand(row.command)
      const task: Task = taskExecutor.createTask(parsed)

      const mainAgent =
        agentEngine.getAllAgents().find((agent) => agent.type === 'main') ||
        agentEngine.initializeMainAgent('hybrid-runtime')

      const result = await agentEngine.routeAndExecuteTask(mainAgent.id, task)

      await supabase
        .from('tasks')
        .update({
          status: 'completed',
          result,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)

      await this.logAgentEvent('TaskAgent', `Remote task completed: ${row.command}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown remote task failure'
      await supabase
        .from('tasks')
        .update({
          status: 'failed',
          error: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      await this.logAgentEvent('TaskAgent', `Remote task failed: ${message}`, 'error')
    }
  }
}

export const hybridBackendCoordinator = new HybridBackendCoordinator()