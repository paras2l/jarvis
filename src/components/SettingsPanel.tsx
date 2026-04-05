import React, { useEffect, useState } from 'react'
import { clearChatHistory, loadChatHistory } from '@/core/chat-history'
import { launchOrchestrator } from '@/core/platform/launch-orchestrator'
import { runConformanceSuite, summarizeConformance } from '@/core/platform/conformance'
import { AuditEntry } from '@/core/platform/types'
import { ChatHistory } from '@/types'

type SettingsPanelProps = {
  open: boolean
  onClose: () => void
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onClose }) => {
  const [nativeLaunch, setNativeLaunch] = useState(true)
  const [uiAutomation, setUiAutomation] = useState(false)
  const [stealthMode, setStealthMode] = useState(false)
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [conformanceMessage, setConformanceMessage] = useState('')

  const refresh = () => {
    const permissions = launchOrchestrator.getPermissionState()
    setNativeLaunch(permissions.nativeLaunch)
    setUiAutomation(permissions.uiAutomation)
    setStealthMode(permissions.stealthMode)
    setAuditEntries(launchOrchestrator.getAuditEntries(25).reverse())
    setChatHistory(loadChatHistory())
  }

  const runConformanceCheck = () => {
    const report = runConformanceSuite()
    const summary = summarizeConformance(report)
    const passed = report.filter((entry) => entry.pass).length
    setConformanceMessage(
      summary.pass
        ? `Conformance check passed for ${passed}/${report.length} cases.`
        : `Conformance check failed for ${summary.failures}/${report.length} cases.`
    )
  }

  const handleClearHistory = () => {
    clearChatHistory()
    setChatHistory([])
    setStatusMessage('Chat history cleared.')
  }

  useEffect(() => {
    if (open) {
      refresh()
    }
  }, [open])

  if (!open) {
    return null
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-panel" onClick={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}>
        <div className="settings-header">
          <h3>Permission Center</h3>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>

        <div className="settings-section">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={nativeLaunch}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                const enabled = event.target.checked
                setNativeLaunch(enabled)
                const result = launchOrchestrator.setNativeLaunchPermission(enabled)
                setStatusMessage(result.message)
              }}
            />
            <span>Allow native app launch</span>
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={uiAutomation}
              onChange={async (event: React.ChangeEvent<HTMLInputElement>) => {
                const enabled = event.target.checked
                setUiAutomation(enabled)
                const result = await launchOrchestrator.setUiAutomationPermission(enabled)
                setStatusMessage(result.message)
                refresh()
              }}
            />
            <span>Allow UI automation (screen interaction)</span>
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={stealthMode}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                const enabled = event.target.checked
                setStealthMode(enabled)
                launchOrchestrator.setStealthMode(enabled)
                setStatusMessage(`Stealth mode ${enabled ? 'enabled' : 'disabled'}.`)
              }}
            />
            <span>Stealth Interaction (Humanoid Behavior)</span>
          </label>

          {statusMessage && <p className="settings-status">{statusMessage}</p>}
        </div>

        <div className="settings-section">
          <div className="settings-audit-header">
            <h4>Chat History</h4>
            <div className="settings-audit-actions">
              <button className="btn-secondary" onClick={handleClearHistory}>Clear History</button>
              <button className="btn-secondary" onClick={refresh}>Refresh</button>
            </div>
          </div>

          <div className="settings-history-list">
            {chatHistory.length === 0 && <p>No saved chat sessions yet.</p>}
            {chatHistory.map((session) => (
              <div key={session.id} className="settings-history-item">
                <div>
                  <strong>{session.messages[0]?.content || 'Chat session'}</strong>
                </div>
                <div className="settings-history-meta">
                  {session.messages.length} messages · Updated {new Date(session.updatedAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-audit-header">
            <h4>Audit Log</h4>
            <div className="settings-audit-actions">
              <button className="btn-secondary" onClick={runConformanceCheck}>Run Conformance</button>
              <button className="btn-secondary" onClick={refresh}>Refresh</button>
            </div>
          </div>

          {conformanceMessage && <p className="settings-status">{conformanceMessage}</p>}

          <div className="settings-audit-list">
            {auditEntries.length === 0 && <p>No audit entries yet.</p>}
            {auditEntries.map((entry) => (
              <div key={entry.id} className="settings-audit-item">
                <div>
                  <strong>{entry.appName}</strong> via <code>{entry.strategy}</code>
                </div>
                <div>{entry.success ? 'Success' : 'Failed'} - {entry.platform}</div>
                <div className="settings-audit-message">{entry.message}</div>
                <div className="settings-audit-message">Reason: <code>{entry.reasonCode}</code></div>
                <div className="settings-audit-time">{new Date(entry.timestamp).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
