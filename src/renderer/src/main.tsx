import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SettingsApp } from './features/settings/settings-app'
import { applyLanguage } from './i18n'
import { Appearance } from './theme/appearance'
import './assets/main.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container is missing from index.html')
}

// Before the first render, so nothing shows in English first.
applyLanguage(window.api.locale.language)

// One renderer bundle serves every window; the main process picks the screen
// through the URL hash when it opens the window.
createRoot(container).render(
  <StrictMode>
    <Appearance>{window.location.hash === '#settings' ? <SettingsApp /> : <App />}</Appearance>
  </StrictMode>
)
