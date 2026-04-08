import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { hybridBackendCoordinator, type WebDashboardSnapshot } from '@/core/hybrid-backend'

const POLL_MS = 7000

export default function WebControlDashboard() {
  const [snapshot, setSnapshot] = useState<WebDashboardSnapshot>({ devices: [], tasks: [], memories: [] })
  const [loading, setLoading] = useState(true)
  const [command, setCommand] = useState('')
  const [targetDeviceId, setTargetDeviceId] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let mounted = true

    const load = async () => {
      const data = await hybridBackendCoordinator.getWebDashboardSnapshot(12)
      if (!mounted) return
      setSnapshot(data)
      setLoading(false)
      if (!targetDeviceId && data.devices[0]?.device_id) {
        setTargetDeviceId(data.devices[0].device_id)
      }
    }

    load().catch(() => {
      setLoading(false)
    })

    const timer = window.setInterval(() => {
      load().catch(() => {})
    }, POLL_MS)

    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [targetDeviceId])

  const onlineDevices = useMemo(
    () => snapshot.devices.filter((device) => String(device.online_status).toLowerCase() === 'online').length,
    [snapshot.devices],
  )

  const sendRemoteCommand = async () => {
    const trimmed = command.trim()
    if (!trimmed || !targetDeviceId) return

    const ok = await hybridBackendCoordinator.queueRemoteCommand(trimmed, targetDeviceId)
    setStatus(ok ? 'Command queued for device execution.' : 'Failed to queue command. Check Supabase tables and RLS.')
    if (ok) {
      setCommand('')
      const fresh = await hybridBackendCoordinator.getWebDashboardSnapshot(12)
      setSnapshot(fresh)
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ marginTop: 0 }}>Jarvis Web Control Dashboard</h2>
      <p style={{ opacity: 0.8, marginBottom: 18 }}>
        Shared Supabase backend view for devices, tasks, and memory logs.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 18 }}>
        <div style={cardStyle}>
          <strong>Devices</strong>
          <div>{snapshot.devices.length} registered</div>
          <div>{onlineDevices} online</div>
        </div>
        <div style={cardStyle}>
          <strong>Task Queue</strong>
          <div>{snapshot.tasks.length} recent tasks</div>
          <div>{snapshot.tasks.filter((task) => task.status === 'queued' || task.status === 'executing').length} active</div>
        </div>
        <div style={cardStyle}>
          <strong>Memory Logs</strong>
          <div>{snapshot.memories.length} recent memories</div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Remote Command</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8 }}>
          <select value={targetDeviceId} onChange={(event) => setTargetDeviceId(event.target.value)}>
            {snapshot.devices.map((device) => (
              <option key={device.device_id} value={device.device_id}>
                {device.name || device.device_id} ({device.device_type})
              </option>
            ))}
          </select>
          <input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Open WhatsApp on desktop"
          />
          <button onClick={sendRemoteCommand}>Send</button>
        </div>
        {status && <p style={{ marginBottom: 0, marginTop: 8 }}>{status}</p>}
      </div>

      <div style={{ ...cardStyle, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Connected Devices</h3>
        {loading ? <div>Loading...</div> : null}
        {!loading && snapshot.devices.length === 0 ? <div>No devices found.</div> : null}
        {snapshot.devices.map((device) => (
          <div key={device.device_id} style={{ borderTop: '1px solid #2a3547', padding: '8px 0' }}>
            <div><strong>{device.name || device.device_id}</strong></div>
            <div>{device.device_type} | {device.platform || 'unknown'} | {device.online_status}</div>
          </div>
        ))}
      </div>

      <div style={{ ...cardStyle, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Recent Tasks</h3>
        {!loading && snapshot.tasks.length === 0 ? <div>No tasks found.</div> : null}
        {snapshot.tasks.map((task) => (
          <div key={task.id} style={{ borderTop: '1px solid #2a3547', padding: '8px 0' }}>
            <div><strong>{task.status.toUpperCase()}</strong> - {task.command}</div>
            <div style={{ opacity: 0.8 }}>Target: {task.target_device_id || 'n/a'}</div>
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Memory Logs</h3>
        {!loading && snapshot.memories.length === 0 ? <div>No memories found.</div> : null}
        {snapshot.memories.map((memory) => (
          <div key={memory.key} style={{ borderTop: '1px solid #2a3547', padding: '8px 0' }}>
            <div><strong>{memory.key}</strong></div>
            <div>{memory.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const cardStyle: CSSProperties = {
  border: '1px solid #2a3547',
  borderRadius: 12,
  padding: 12,
  background: 'rgba(8, 14, 24, 0.85)',
}
