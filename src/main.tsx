import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled with the app so nothing loads from an outside server.
import '@fontsource-variable/literata/opsz.css'
import '@fontsource-variable/mona-sans/standard.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
