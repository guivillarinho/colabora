import { ThemeToggle } from '@/components/theme-toggle'
import { AgendaPage } from '@/features/dashboard/agenda-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { ProductivityAdviceDialog } from '@/features/tasks/components/productivity-advice-dialog'
import { CreateTaskDialog } from '@/features/tasks/components/task-form-dialog'
import { TasksPage } from '@/features/tasks/tasks-page'
import { useTasks } from '@/features/tasks/tasks-context'

import { AppNav } from './app-nav'
import { useNavigation } from './navigation'

export function AppShell() {
  const { section } = useNavigation()
  const { advice, clearAdvice, error } = useTasks()

  return (
    <div className="min-h-svh bg-background md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-svh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="grid gap-1 px-5 py-6">
          <p className="text-lg font-semibold tracking-tight">Colabora</p>
          <p className="text-sm text-muted-foreground">Tarefas no seu ritmo</p>
        </div>
        <AppNav layout="sidebar" />
      </aside>

      <div className="flex min-h-svh min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="grid gap-1">
              <p className="text-4xl font-semibold tracking-tight">Colabora</p>
              <p className="text-lg text-muted-foreground">Olá, Guilherme</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:block">
                <CreateTaskDialog />
              </div>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">
          {error ? (
            <p className="mb-4 text-sm text-destructive">{error}</p>
          ) : null}
          {section === 'hoje' ? <DashboardPage /> : null}
          {section === 'tarefas' ? <TasksPage /> : null}
          {section === 'agenda' ? <AgendaPage /> : null}
        </main>

        <AppNav center={<CreateTaskDialog variant="icon" />} layout="bottom" />
      </div>
      <ProductivityAdviceDialog advice={advice} onClose={clearAdvice} />
    </div>
  )
}
