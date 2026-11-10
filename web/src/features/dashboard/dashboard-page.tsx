import { MutedText, PageTitle } from '@/components/typography'
import { useNavigation } from '@/components/layout/navigation'
import { useTasks } from '@/features/tasks/tasks-context'

import { ProgressSummary } from './components/progress-summary'
import { TaskTimeline } from './components/task-timeline'
import { ActiveTimer } from './components/active-timer'
import { TodayAgenda } from './components/today-agenda'

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
      <ProgressSummary completed={completed} total={tasks.length} />
      <TodayAgenda onViewAll={() => goTo('agenda')} />
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
