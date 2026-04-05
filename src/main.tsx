import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installNativeBridgeShim } from './core/native-bridge-shim'

installNativeBridgeShim()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
