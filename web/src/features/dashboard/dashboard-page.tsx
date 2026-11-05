import { TimerPage } from '@/features/timer/timer-page'
import { MutedText, PageTitle } from '@/components/typography'
import { useNavigation } from '@/components/layout/navigation'
import { useTasks } from '@/features/tasks/tasks-context'

import { ProgressSummary } from './components/progress-summary'
import { TaskTimeline } from './components/task-timeline'
import { ActiveTimer } from './components/active-timer'

export function DashboardPage() {
  const { tasks, completeTask, removeTask } = useTasks()
  const { goTo } = useNavigation()

  const completed = tasks.filter((task) => task.status === 'completed').length

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <div className="grid gap-1">
        <PageTitle>Hoje</PageTitle>
        <MutedText>Seu progresso e o que vem a seguir.</MutedText>
      </div>
      <ActiveTimer
        tasks={tasks}
        onComplete={(taskId) => completeTask(taskId)}
      />
      <TimerPage dashboardOnly />
      <ProgressSummary completed={completed} total={tasks.length} />
      <section
        className="glass-panel grid gap-2 rounded-2xl border p-5"
        aria-label="Tempo de execução das tarefas"
      >
        <h2 className="font-semibold">Tempo de execução das tarefas</h2>
        <p className="text-2xl font-semibold tabular-nums">
          {tasks
            .filter((task) => task.status === 'completed')
            .reduce((total, task) => total + (task.actualTime ?? 0), 0)}{' '}
          min
        </p>
        <MutedText>
          Tempo registrado nas tarefas concluídas, incluindo durações informadas
          ou estimadas. As sessões de Pomodoro aparecem no dashboard de foco.
        </MutedText>
      </section>
      <TaskTimeline
        tasks={tasks}
        preview
        onComplete={(taskId, actualTime) => completeTask(taskId, actualTime)}
        onDelete={(taskId) => removeTask(taskId)}
        onViewAll={() => goTo('agenda')}
      />
    </div>
  )
}
