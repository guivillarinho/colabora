import { MutedText, PageTitle } from '@/components/typography'
import { useTasks } from '@/features/tasks/tasks-context'

import { TaskTimeline } from './components/task-timeline'

export function AgendaPage() {
  const { tasks } = useTasks()

  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <PageTitle>Agenda</PageTitle>
        <MutedText>A linha do tempo do seu dia.</MutedText>
      </div>
      <TaskTimeline tasks={tasks} />
    </div>
  )
}
