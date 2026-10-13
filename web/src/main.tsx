import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled from npm (SIL OFL) and served from this site, never from a font CDN.
import '@fontsource-variable/plus-jakarta-sans/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
