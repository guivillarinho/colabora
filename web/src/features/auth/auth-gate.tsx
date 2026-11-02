import { useEffect } from 'react'
import { App } from '@/app/App'
import { TasksProvider } from '@/features/tasks/tasks-context'
import { AuthPage } from './auth-page'
import { useAuth } from './auth-context'

export function AuthGate() {
  const { user, checking } = useAuth()
  useEffect(() => {
    if (user && ['/entrar', '/cadastro'].includes(window.location.pathname))
      window.history.replaceState(null, '', '/hoje')
  }, [user])
  if (checking)
    return (
      <main className="grid min-h-svh place-items-center">
        <p role="status">Verificando sua sessão...</p>
      </main>
    )
  if (!user) return <AuthPage />
  return (
    <TasksProvider key={user.id}>
      <App />
    </TasksProvider>
  )
}
