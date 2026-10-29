import { MutedText, PageTitle } from '@/components/typography'

import { TaskBoard } from './components/task-board'

export function TasksPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <PageTitle>Tarefas</PageTitle>
        <MutedText>O que você precisa fazer.</MutedText>
      </div>
      <TaskBoard />
    </div>
  )
}
