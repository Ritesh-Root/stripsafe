import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import '../astryx-themes.js'
import '@fontsource/ibm-plex-mono/500.css'
import './styles/app.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import { App } from './App'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
