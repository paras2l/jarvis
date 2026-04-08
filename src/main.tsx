import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installNativeBridgeShim } from './core/native-bridge-shim'

installNativeBridgeShim()

const rootElement = document.getElementById('root')

const showRendererError = (message: string) => {
  if (!rootElement) return

  rootElement.innerHTML = `
    <div style="font-family: Segoe UI, Arial, sans-serif; min-height: 100vh; margin: 0; background: #0e1117; color: #e6edf3; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box;">
      <div style="max-width: 860px; background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 18px;">
        <h1 style="margin: 0 0 12px; font-size: 22px;">Pixi renderer failed to start</h1>
        <p style="margin: 0 0 10px;">A runtime error was caught instead of showing a blank white screen.</p>
        <pre style="margin: 0; white-space: pre-wrap; word-break: break-word; background: #0d1117; border: 1px solid #30363d; padding: 10px; border-radius: 8px;">${message}</pre>
      </div>
    </div>
  `
}

window.addEventListener('error', (event) => {
  const error = event.error as Error | undefined
  const message = error?.stack || error?.message || event.message || 'Unknown renderer error'
  showRendererError(message)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as { stack?: string; message?: string } | string | undefined
  const message =
    typeof reason === 'string'
      ? reason
      : reason?.stack || reason?.message || 'Unhandled promise rejection in renderer'
  showRendererError(message)
})

if (!rootElement) {
  throw new Error('Root element #root not found.')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

