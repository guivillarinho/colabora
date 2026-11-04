import { useAuth } from '@/features/auth/auth-context'
import { AccountPage } from '@/features/auth/account-page'
import { useState } from 'react'
import { LogOut, UserRound } from 'lucide-react'

import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { AgendaPage } from '@/features/dashboard/agenda-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { ProductivityAdviceDialog } from '@/features/tasks/components/productivity-advice-dialog'
import { CreateTaskDialog } from '@/features/tasks/components/task-form-dialog'
import { TimerPage } from '@/features/timer/timer-page'
import { useTasks } from '@/features/tasks/tasks-context'

import { AppNav } from './app-nav'
import { useNavigation } from './navigation'

declare const process: {
  env: {
    VITE_USER_AVATAR_URL?: string
  }
}

export function AppShell() {
  const { section } = useNavigation()
  const { user, logout } = useAuth()
  const { advice, clearAdvice, error } = useTasks()
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError(null)
    try {
      await logout()
    } catch {
      setLogoutError('Não foi possível encerrar a sessão. Tente novamente.')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="min-h-svh bg-background md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-svh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 px-5 py-6">
          <p className="text-sm font-medium text-muted-foreground">
            Tarefas no seu ritmo
          </p>
        </div>
        <AppNav layout="sidebar" />
      </aside>

      <div className="flex min-h-svh min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar />
              <p className="truncate text-lg font-medium text-muted-foreground">
                Olá, {user?.name}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden md:block">
                <CreateTaskDialog />
              </div>
              <ThemeToggle />
              <Button
                aria-label={loggingOut ? 'Saindo...' : 'Sair da conta'}
                aria-busy={loggingOut}
                title="Sair da conta"
                disabled={loggingOut}
                size="icon"
                type="button"
                variant="outline"
                onClick={handleLogout}
              >
                <LogOut aria-hidden="true" />
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">
          {logoutError ? (
            <p role="alert" className="mb-4 text-sm text-destructive">
              {logoutError}
            </p>
          ) : null}
          {error ? (
            <p className="mb-4 text-sm text-destructive">{error}</p>
          ) : null}
          <div key={section} className="colabora-page-enter">
            {section === 'hoje' ? <DashboardPage /> : null}
            {section === 'timer' ? <TimerPage /> : null}
            {section === 'agenda' ? <AgendaPage /> : null}
            {section === 'perfil' ? <AccountPage /> : null}
          </div>
        </main>

        <AppNav center={<CreateTaskDialog variant="icon" />} layout="bottom" />
      </div>
      <ProductivityAdviceDialog advice={advice} onClose={clearAdvice} />
    </div>
  )
}

function UserAvatar() {
  const { user } = useAuth()
  const [imageUnavailable, setImageUnavailable] = useState(false)
  const imageUrl = process.env.VITE_USER_AVATAR_URL || ''

  return (
    <div
      aria-label={`Perfil de ${user?.name ?? 'usuário'}`}
      className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-secondary text-secondary-foreground"
      role="img"
    >
      {imageUrl && !imageUnavailable ? (
        <img
          alt="Avatar ilustrativo do perfil"
          className="size-full object-cover"
          src={imageUrl}
          onError={() => setImageUnavailable(true)}
        />
      ) : (
        <UserRound aria-hidden="true" className="size-6" />
      )}
    </div>
  )
}
