import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AuthProvider } from '@/features/auth/auth-context'
import { AuthGate } from '@/features/auth/auth-gate'
import { InstallAppProvider } from '@/features/install/install-app'
import { applyPalette, readStoredPalette } from './app/palette'
import { PaletteProvider } from './app/palette-provider'
import { AccountPreferencesProvider } from './app/account-preferences'
import { ThemeProvider } from './app/theme-provider.tsx'
import './index.css'

applyPalette(readStoredPalette())

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
    <AuthProvider>
      <AccountPreferencesProvider>
        <ThemeProvider>
          <PaletteProvider>
            <InstallAppProvider>
              <AuthGate />
            </InstallAppProvider>
          </PaletteProvider>
        </ThemeProvider>
      </AccountPreferencesProvider>
    </AuthProvider>
  </StrictMode>,
)
