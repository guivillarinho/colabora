import { useEffect } from 'react'

import { MutedText, PageTitle } from '@/components/typography'
import { useNavigation } from '@/components/layout/navigation'
import { googleStatus, googleSyncNow } from '@/features/google/google-api'
import { useTasks } from '@/features/tasks/tasks-context'

import { ProgressSummary } from './components/progress-summary'
import { TaskTimeline } from './components/task-timeline'
import { ActiveTimer } from './components/active-timer'
import { TodayAgenda } from './components/today-agenda'

export function DashboardPage() {
  const { tasks, loading, completeTask, removeTask } = useTasks()
  const { goTo } = useNavigation()

  const completed = tasks.filter((task) => task.status === 'completed').length

  useEffect(() => {
    let active = true
    googleStatus()
      .then(async (status) => {
        if (
          !active ||
          !status.configured ||
          status.status !== 'connected' ||
          !status.preferences?.inboundEnabled
        )
          return
        await googleSyncNow()
        if (active) window.dispatchEvent(new Event('colabora-google-synced'))
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

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
        loading={loading}
        preview
        onComplete={(taskId, actualTime) => completeTask(taskId, actualTime)}
        onDelete={(taskId) => removeTask(taskId)}
        onViewAll={() => goTo('agenda')}
      />
    </div>
  )
}
