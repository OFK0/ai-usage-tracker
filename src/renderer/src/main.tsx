import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SettingsApp } from './features/settings/settings-app'
import './assets/main.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container is missing from index.html')
}

// One renderer bundle serves every window; the main process picks the screen
// through the URL hash when it opens the window.
createRoot(container).render(
  <StrictMode>{window.location.hash === '#settings' ? <SettingsApp /> : <App />}</StrictMode>
)
