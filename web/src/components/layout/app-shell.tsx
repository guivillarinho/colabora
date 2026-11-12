import { ChatPage } from '@/features/assistant/chat-page'
import { useAuth } from '@/features/auth/auth-context'
import { AccountPage } from '@/features/auth/account-page'
import { useEffect, useState } from 'react'
import { ArrowLeft, CircleCheck, LogOut, MessageCircle, X } from 'lucide-react'
import { UserAvatar } from '@/features/auth/user-avatar'

import { ThemeToggle } from '@/components/theme-toggle'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { ToastMessage } from '@/lib/toast'
import { AgendaPage } from '@/features/dashboard/agenda-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { ProductivityAdviceDialog } from '@/features/tasks/components/productivity-advice-dialog'
import { CreateTaskDialog } from '@/features/tasks/components/task-form-dialog'
import { TimerPage } from '@/features/timer/timer-page'
import { useTasks } from '@/features/tasks/tasks-context'

import { AppNav } from './app-nav'
import { useNavigation } from './navigation'

export function AppShell() {
  const { section, goTo } = useNavigation()
  const { user, logout } = useAuth()
  const { advice, clearAdvice, error } = useTasks()
  const [scrolled, setScrolled] = useState(() => window.scrollY > 0)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ToastMessage>).detail
      if (detail?.title && detail.description) {
        setToast(detail)
      }
    }
    window.addEventListener('colabora:toast', handler)
    return () => window.removeEventListener('colabora:toast', handler)
  }, [])

  useEffect(() => {
    if (!toast || toast.duration === null) return
    const timer = setTimeout(() => setToast(null), toast.duration ?? 6000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const updateScroll = () => setScrolled(window.scrollY > 0)
    updateScroll()
    window.addEventListener('scroll', updateScroll, { passive: true })
    return () => window.removeEventListener('scroll', updateScroll)
  }, [])

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
    <div className="colabora-app min-h-svh md:grid md:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="surface-chrome sticky top-0 hidden h-svh flex-col border-r text-sidebar-foreground md:flex">
        <div className="grid gap-1 px-6 pt-8 pb-6">
          <p className="text-xl font-semibold tracking-tight">Colabora</p>
          <p className="text-xs text-muted-foreground">Tarefas no seu ritmo</p>
        </div>
        <AppNav layout="sidebar" />
      </aside>

      <div className="flex min-h-svh min-w-0 flex-col">
        <header
          data-scrolled={scrolled}
          className="colabora-header sticky top-0 z-20 border-b px-4 py-4 md:px-8"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {section === 'perfil' ? (
                <>
                  <Button
                    aria-label="Voltar para Hoje"
                    size="icon"
                    type="button"
                    variant="outline"
                    className="size-11 rounded-full"
                    onClick={() => goTo('hoje')}
                  >
                    <ArrowLeft aria-hidden="true" />
                  </Button>
                  <p className="text-lg font-semibold">Perfil</p>
                </>
              ) : (
                <>
                  <UserAvatar />
                  <p className="truncate text-lg font-medium text-muted-foreground">
                    Olá, {user?.name}
                  </p>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden md:block">
                <CreateTaskDialog />
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Abrir assistente"
                onClick={() => goTo('chat')}
              >
                <MessageCircle aria-hidden="true" />
              </Button>
              <ThemeToggle />
              {section !== 'perfil' ? (
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
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-36 md:px-8 md:pb-8">
          {logoutError ? (
            <p role="alert" className="mb-4 text-sm text-destructive">
              {logoutError}
            </p>
          ) : null}
          {error ? (
            <p className="mb-4 text-sm text-destructive">{error}</p>
          ) : null}
          <div key={section} className="colabora-page-enter">
            {section === 'chat' ? <ChatPage /> : null}
            {section === 'hoje' ? <DashboardPage /> : null}
            {section === 'timer' ? <TimerPage /> : null}
            {section === 'agenda' ? <AgendaPage /> : null}
            {section === 'perfil' ? <AccountPage /> : null}
          </div>
        </main>

        <AppNav center={<CreateTaskDialog variant="icon" />} layout="bottom" />
      </div>
      <ProductivityAdviceDialog advice={advice} onClose={clearAdvice} />
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <Alert
            role="status"
            aria-live="polite"
            className="pointer-events-auto max-h-[calc(100svh-2rem)] w-full max-w-lg overflow-y-auto shadow-lg"
          >
            <CircleCheck aria-hidden="true" />
            <AlertTitle>{toast.title}</AlertTitle>
            <AlertDescription className="min-w-0 whitespace-pre-line break-words [overflow-wrap:anywhere]">
              {toast.description}
            </AlertDescription>
            <AlertAction>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Fechar notificação"
                onClick={() => setToast(null)}
              >
                <X aria-hidden="true" />
              </Button>
            </AlertAction>
          </Alert>
        </div>
      ) : null}
    </div>
  )
}
