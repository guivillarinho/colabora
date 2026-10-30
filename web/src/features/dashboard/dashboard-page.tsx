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
    <div className="grid gap-8">
      <div className="grid gap-1">
        <PageTitle>Hoje</PageTitle>
        <MutedText>Seu progresso e o que vem a seguir.</MutedText>
      </div>
      <ActiveTimer
        tasks={tasks}
        onComplete={(taskId) => completeTask(taskId)}
      />
      <ProgressSummary completed={completed} total={tasks.length} />
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
