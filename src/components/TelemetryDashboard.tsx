import { useEffect, useMemo, useState } from 'react'
import { collectProductionTelemetrySnapshot, ProductionTelemetrySnapshot } from '@/core/ops/production-telemetry'

type TelemetryDashboardProps = {
  compact?: boolean
}

const POLL_MS = 5000

export default function TelemetryDashboard({ compact = false }: TelemetryDashboardProps) {
  const [snapshot, setSnapshot] = useState<ProductionTelemetrySnapshot>(() => collectProductionTelemetrySnapshot())

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSnapshot(collectProductionTelemetrySnapshot())
    }, POLL_MS)

    return () => window.clearInterval(timer)
  }, [])

  const statusLabel = useMemo(() => {
    if (snapshot.releaseGate.pass) return 'Release Gate: PASS'
    return 'Release Gate: BLOCKED'
  }, [snapshot.releaseGate.pass])

  return (
    <div
      style={{
        border: '1px solid var(--border-color, #2d3748)',
        borderRadius: 12,
        padding: compact ? 10 : 14,
        background: 'rgba(15, 23, 42, 0.35)',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Production Telemetry</strong>
        <span style={{ color: snapshot.releaseGate.pass ? '#16a34a' : '#dc2626' }}>{statusLabel}</span>
      </div>

      <div style={{ fontSize: 12, lineHeight: 1.5 }}>
        <div>Protocols: {snapshot.protocol.totalExecutions} execs | {snapshot.protocol.successRate.toFixed(1)}% success</div>
        <div>Latency: {snapshot.protocol.avgLatencyMs.toFixed(1)}ms | Failing: {snapshot.protocol.failing} | Degraded: {snapshot.protocol.degraded}</div>
        <div>Policy: {snapshot.policy.decisions} decisions | deny rate {(snapshot.policy.denyRate * 100).toFixed(1)}%</div>
        <div>Mutation: {snapshot.mutation.totalEntries} entries | failure {(snapshot.mutation.failureRate * 100).toFixed(1)}%</div>
      </div>

      {!snapshot.releaseGate.pass && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#f97316' }}>
          {snapshot.releaseGate.failedChecks.map((check) => (
            <div key={check}>- {check}</div>
          ))}
        </div>
      )}
    </div>
  )
}
