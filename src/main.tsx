import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { applyBgAnimationClass, isBgAnimationEnabled } from './lib/settings'

// Applied before the first render so a saved "off" preference doesn't
// flash the animated background on for a frame.
applyBgAnimationClass(isBgAnimationEnabled())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
