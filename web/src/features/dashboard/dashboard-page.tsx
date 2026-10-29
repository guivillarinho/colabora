import { MutedText, PageTitle } from '@/components/typography'
import { useTasks } from '@/features/tasks/tasks-context'

import { ProgressSummary } from './components/progress-summary'
import { TaskTimeline } from './components/task-timeline'
import { ActiveTimer } from './components/active-timer'

export function DashboardPage() {
  const { tasks, completeTask } = useTasks()

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
        onComplete={(taskId, actualTime) => completeTask(taskId, actualTime)}
      />
    </div>
  )
}
