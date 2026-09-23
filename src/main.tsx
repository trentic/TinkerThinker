import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { applyBgAnimationClass, isBgAnimationEnabled } from './lib/settings'

// Applied before the first render so a saved "off" preference doesn't
// flash the animated background on for a frame.
applyBgAnimationClass(isBgAnimationEnabled())

// registerType: 'autoUpdate' (vite.config.ts) makes the service worker
// itself activate a new version in the background, but that alone never
// reloads an already-open tab — it would otherwise keep running the old JS
// (old build-info baked in) until the next full navigation. Reloading on
// update, plus polling for one instead of waiting on the browser's own
// (~daily) check cycle, is what actually makes "autoUpdate" live up to its
// name and keeps Settings' build footer trustworthy.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    setInterval(() => void registration.update(), 60_000)
  },
  onNeedRefresh() {
    window.location.reload()
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
