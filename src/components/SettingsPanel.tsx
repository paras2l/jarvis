import React, { useEffect, useState } from 'react'
import { clearChatHistory, loadChatHistory } from '@/core/chat-history'
import { launchOrchestrator } from '@/core/platform/launch-orchestrator'
import { runConformanceSuite, summarizeConformance } from '@/core/platform/conformance'
import { AuditEntry } from '@/core/platform/types'
import { runtimePolicyStore, RuntimePolicy } from '@/core/runtime-policy'
import { providerMatrixRouter } from '@/core/provider-matrix-router'
import { agentFrameworkAdapters } from '@/core/agent-framework-adapters'
import { getWhisperConfig, updateWhisperConfig } from '@/voice/whisper-recognition'
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
  const [runtimePolicy, setRuntimePolicy] = useState<RuntimePolicy>(runtimePolicyStore.get())
  const [providerPref, setProviderPref] = useState(providerMatrixRouter.getPreference())
  const [frameworkConfig, setFrameworkConfig] = useState(agentFrameworkAdapters.getConfig())
  const [whisperConfig, setWhisperConfig] = useState(getWhisperConfig())

  const refresh = () => {
    const permissions = launchOrchestrator.getPermissionState()
    setNativeLaunch(permissions.nativeLaunch)
    setUiAutomation(permissions.uiAutomation)
    setStealthMode(permissions.stealthMode)
    setAuditEntries(launchOrchestrator.getAuditEntries(25).reverse())
    setChatHistory(loadChatHistory())
    setRuntimePolicy(runtimePolicyStore.get())
    setProviderPref(providerMatrixRouter.getPreference())
    setFrameworkConfig(agentFrameworkAdapters.getConfig())
    setWhisperConfig(getWhisperConfig())
  }

  const updateRuntimePolicy = (partial: Partial<RuntimePolicy>) => {
    const next = runtimePolicyStore.update(partial)
    setRuntimePolicy(next)
    setStatusMessage('Runtime policy updated. Restart daemon/runtime to apply loop cadence changes immediately.')
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
          <div className="settings-audit-header">
            <h4>Provider Matrix Preferences</h4>
          </div>

          {(['chat', 'reasoning', 'code', 'vision', 'research'] as const).map((taskClass) => (
            <label className="settings-toggle" key={taskClass}>
              <span>{taskClass.toUpperCase()} provider</span>
              <select
                value={providerPref[taskClass]}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                  const next = providerMatrixRouter.updatePreference({
                    [taskClass]: event.target.value,
                  })
                  setProviderPref(next)
                  setStatusMessage(`${taskClass} provider updated.`)
                }}
              >
                <option value="local">local</option>
                <option value="openai">openai</option>
                <option value="gpt">gpt (legacy)</option>
                <option value="claude">claude</option>
                <option value="deepseek">deepseek</option>
                <option value="custom">custom</option>
              </select>
            </label>
          ))}
        </div>

        <div className="settings-section">
          <div className="settings-audit-header">
            <h4>Framework Endpoints</h4>
          </div>

          <label className="settings-toggle">
            <span>LangGraph endpoint</span>
            <input
              type="text"
              value={frameworkConfig.langgraphEndpoint || ''}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                const next = agentFrameworkAdapters.updateConfig({ langgraphEndpoint: event.target.value.trim() })
                setFrameworkConfig(next)
              }}
              placeholder="http://localhost:8001/run"
            />
          </label>

          <label className="settings-toggle">
            <span>AutoGen endpoint</span>
            <input
              type="text"
              value={frameworkConfig.autogenEndpoint || ''}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                const next = agentFrameworkAdapters.updateConfig({ autogenEndpoint: event.target.value.trim() })
                setFrameworkConfig(next)
              }}
              placeholder="http://localhost:8002/run"
            />
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-audit-header">
            <h4>Offline Voice Configuration (No Python)</h4>
          </div>

          <label className="settings-toggle">
            <span>Voice provider</span>
            <select value="native" disabled>
              <option value="native">native_local (offline-friendly)</option>
            </select>
          </label>

          <label className="settings-toggle">
            <span>Whisper model</span>
            <select
              value={whisperConfig.model}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                setWhisperConfig((prev) => ({ ...prev, model: event.target.value as typeof prev.model }))
              }}
            >
              <option value="tiny">tiny</option>
              <option value="base">base</option>
              <option value="small">small</option>
            </select>
          </label>

          <label className="settings-toggle">
            <span>Whisper device</span>
            <select
              value={whisperConfig.device}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                setWhisperConfig((prev) => ({ ...prev, device: event.target.value as typeof prev.device }))
              }}
            >
              <option value="cpu">cpu</option>
              <option value="gpu">gpu</option>
            </select>
          </label>

          <button
            className="btn-secondary"
            onClick={() => {
              const next = updateWhisperConfig(whisperConfig)
              setWhisperConfig(next)
              window.nativeBridge?.assistantService?.start?.({
                provider: 'native',
                whisperModel: next.model,
                whisperDevice: next.device,
              }).catch(() => {})
              setStatusMessage('Offline voice configuration saved. No Python dependency is used.')
            }}
          >
            Save Whisper Config
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-audit-header">
            <h4>Autonomous Runtime Policy</h4>
            <div className="settings-audit-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  const reset = runtimePolicyStore.reset()
                  setRuntimePolicy(reset)
                  setStatusMessage('Runtime policy reset to defaults.')
                }}
              >
                Reset Policy
              </button>
            </div>
          </div>

          <label className="settings-toggle">
            <span>Autonomy Mode</span>
            <select
              value={runtimePolicy.autonomyMode}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                updateRuntimePolicy({ autonomyMode: event.target.value as RuntimePolicy['autonomyMode'] })
              }}
            >
              <option value="observe">observe (no autonomous execution)</option>
              <option value="assist">assist (safe autonomous nudges)</option>
              <option value="autonomous">autonomous (max proactive behavior)</option>
            </select>
          </label>

          <label className="settings-toggle">
            <span>Voice Backend</span>
            <select
              value={runtimePolicy.voiceBackend}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                updateRuntimePolicy({ voiceBackend: event.target.value as RuntimePolicy['voiceBackend'] })
              }}
            >
              <option value="native">native speech</option>
              <option value="whisper">whisper backend</option>
            </select>
          </label>

          <label className="settings-toggle">
            <span>Orchestration Framework</span>
            <select
              value={runtimePolicy.orchestrationFramework}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                updateRuntimePolicy({ orchestrationFramework: event.target.value as RuntimePolicy['orchestrationFramework'] })
              }}
            >
              <option value="native">native orchestrator</option>
              <option value="langgraph">langgraph adapter</option>
              <option value="autogen">autogen adapter</option>
            </select>
          </label>

          <label className="settings-toggle">
            <span>Loop Interval (milliseconds)</span>
            <input
              type="number"
              min={4000}
              max={120000}
              step={1000}
              value={runtimePolicy.loopIntervalMs}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                const value = Number(event.target.value)
                updateRuntimePolicy({ loopIntervalMs: value })
              }}
            />
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={runtimePolicy.proactiveVoice}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                updateRuntimePolicy({ proactiveVoice: event.target.checked })
              }}
            />
            <span>Allow proactive voice briefings</span>
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={runtimePolicy.allowVoiceCommandExecution}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                updateRuntimePolicy({ allowVoiceCommandExecution: event.target.checked })
              }}
            />
            <span>Allow wake-word voice commands to execute actions</span>
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={runtimePolicy.allowPredictionActions}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                updateRuntimePolicy({ allowPredictionActions: event.target.checked })
              }}
            />
            <span>Allow prediction engine auto-actions</span>
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={runtimePolicy.allowCuriosityLearning}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                updateRuntimePolicy({ allowCuriosityLearning: event.target.checked })
              }}
            />
            <span>Allow curiosity engine autonomous learning cycles</span>
          </label>
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
