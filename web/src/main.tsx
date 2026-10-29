import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { TasksProvider } from '@/features/tasks/tasks-context'

import { App } from './app/App.tsx'
import { ThemeProvider } from './app/theme-provider.tsx'
import './index.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Elemento #root não encontrado')
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <TasksProvider>
        <App />
      </TasksProvider>
    </ThemeProvider>
  </StrictMode>,
)
