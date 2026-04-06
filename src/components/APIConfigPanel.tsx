import React, { useState, useEffect } from 'react'
import type { APIProvider, APIConfig } from '../types'
import { apiRegistry } from '../core/api-registry'
import { APIConfigStorage } from '../core/api-config-storage'
import './APIConfigPanel.css'

interface APIConfigPanelProps {
  onClose: () => void
  onConfigAdded?: (config: APIConfig) => void
}

export const APIConfigPanel: React.FC<APIConfigPanelProps> = ({
  onClose,
  onConfigAdded
}) => {
  const [selectedProvider, setSelectedProvider] = useState<APIProvider>('nvidia')
  const [apiKey, setApiKey] = useState('')
  const [configName, setConfigName] = useState('')
  const [configs, setConfigs] = useState<APIConfig[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)

  // Load configs on mount
  useEffect(() => {
    loadConfigs()
  }, [])

  const loadConfigs = () => {
    const allConfigs = apiRegistry.listAllConfigs()
    setConfigs(allConfigs)
  }

  const handleAddConfig = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Validate
    if (!apiKey.trim()) {
      setError('API key is required')
      return
    }

    // Validate format
    if (!APIConfigStorage.validateKey(selectedProvider, apiKey)) {
      setError(`Invalid API key format for ${selectedProvider}. Check the key and try again.`)
      return
    }

    try {
      const config = apiRegistry.addConfig(
        selectedProvider,
        apiKey,
        configName || undefined
      )
      
      setSuccess(`✓ ${selectedProvider} API added successfully`)
      setApiKey('')
      setConfigName('')
      setShowForm(false)
      
      loadConfigs()
      onConfigAdded?.(config)
      
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add config')
    }
  }

  const handleDeleteConfig = (id: string) => {
    if (window.confirm('Delete this API configuration?')) {
      apiRegistry.deleteConfig(id)
      loadConfigs()
      setSuccess('Configuration deleted')
      setTimeout(() => setSuccess(''), 2000)
    }
  }

  const providers: APIProvider[] = ['nvidia', 'huggingface', 'replicate', 'openai', 'custom']

  return (
    <div className="api-config-panel">
      <div className="panel-header">
        <h2>API Configuration</h2>
        <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="panel-content">
        {/* Success message */}
        {success && <div className="message success">{success}</div>}
        
        {/* Error message */}
        {error && <div className="message error">{error}</div>}

        {/* Configured APIs List */}
        <div className="configs-section">
          <h3>Configured APIs</h3>
          
          {configs.length === 0 ? (
            <p className="empty-state">No APIs configured yet. Add one to get started.</p>
          ) : (
            <div className="configs-list">
              {configs.map(cfg => (
                <div key={cfg.id} className="config-item">
                  <div className="config-info">
                    <div className="config-header">
                      <span className="provider-badge">{cfg.provider.toUpperCase()}</span>
                      <span className="config-name">{cfg.name}</span>
                    </div>
                    <div className="config-meta">
                      <span className="key-preview">Key: {cfg.apiKey.slice(0, 8)}•••</span>
                      <span className="added-date">{new Date(cfg.createdAt).toLocaleDateString()}</span>
                      {cfg.lastUsed && (
                        <span className="last-used">Used: {new Date(cfg.lastUsed).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="delete-btn"
                    onClick={() => handleDeleteConfig(cfg.id)}
                    title="Delete this configuration"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add New API Form */}
        <div className="add-api-section">
          {!showForm ? (
            <button
              className="add-api-btn"
              onClick={() => setShowForm(true)}
            >
              + Add New API
            </button>
          ) : (
            <form onSubmit={handleAddConfig} className="api-form">
              <h3>Add API Configuration</h3>

              <div className="form-group">
                <label htmlFor="provider">Provider</label>
                <select
                  id="provider"
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value as APIProvider)}
                  className="form-control"
                >
                  {providers.map(p => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="api-key">API Key</label>
                <input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Enter your ${selectedProvider} API key`}
                  className="form-control"
                  autoComplete="off"
                />
                <small className="hint">Your API key is encrypted locally. Never shared.</small>
              </div>

              <div className="form-group">
                <label htmlFor="config-name">Name (Optional)</label>
                <input
                  id="config-name"
                  type="text"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                  placeholder="e.g., Production Key"
                  className="form-control"
                />
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="submit-btn"
                >
                  Add API
                </button>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Status Summary */}
        <div className="status-summary">
          <p className="status-text">
            <strong>Available APIs:</strong> {apiRegistry.getAvailableProviders().length} configured
          </p>
        </div>
      </div>
    </div>
  )
}
