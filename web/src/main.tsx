import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AuthProvider } from '@/features/auth/auth-context'
import { AuthGate } from '@/features/auth/auth-gate'
import { ThemeProvider } from './app/theme-provider.tsx'
import './index.css'

const root = document.getElementById('root')

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .catch(() => undefined)
  })
}

if (!root) {
  throw new Error('Elemento #root não encontrado')
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
