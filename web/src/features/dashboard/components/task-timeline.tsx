import { useState } from 'react'
import { CheckIcon } from 'lucide-react'

import { pastelSwatches } from '@/components/pastel'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/format-duration'
import { cn } from 'cn'
import { MutedText, SectionTitle } from '@/components/typography'
import { sortTasks } from '@/features/tasks/sort-tasks'
import type { Task } from '@/features/tasks/types/task'

import { CompleteTaskDialog } from '../../tasks/components/complete-task-dialog'
import { TaskFormDialog } from '../../tasks/components/task-form-dialog'

type TaskTimelineProps = {
  tasks: Task[]
  onComplete: (taskId: string, actualTime?: number) => Promise<void>
}

export function TaskTimeline({ tasks, onComplete }: TaskTimelineProps) {
  const ordered = sortTasks(tasks, 'dueDate')

  return (
    <section className="grid gap-4">
      <SectionTitle>Linha do tempo</SectionTitle>
      {ordered.length === 0 ? (
        <MutedText>
          Nada agendado. As tarefas com data e hora aparecem aqui.
        </MutedText>
      ) : (
        <ol className="grid gap-3">
          {ordered.map((task) => (
            <TimelineTask key={task.id} task={task} onComplete={onComplete} />
          ))}
        </ol>
      )}
    </section>
  )
}

type TimelineTaskProps = {
  task: Task
  onComplete: TaskTimelineProps['onComplete']
}

function TimelineTask({ task, onComplete }: TimelineTaskProps) {
  const [completing, setCompleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const swatch =
    pastelSwatches.find((item) => item.id === task.color) ?? pastelSwatches[1]
  const date = task.dueDate ? new Date(task.dueDate) : null
  const dateLabel = date
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date)
    : 'Sem data'
  const timeLabel = date
    ? new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
    : 'Sem horário'
  const isCompleted = task.status === 'completed'

  return (
    <li className="relative">
      <article
        className={cn(
          'grid gap-2 rounded-xl border bg-card p-3 sm:p-4',
          isCompleted && 'opacity-70',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <MutedText>{dateLabel}</MutedText>
          <span className="rounded-lg bg-primary px-2.5 py-1.5 text-sm font-semibold tabular-nums text-primary-foreground">
            {timeLabel}
          </span>
        </div>
        <h3 className="font-semibold leading-snug">{task.title}</h3>
        {task.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {task.description}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium',
              swatch.className,
            )}
          >
            {task.category}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDuration(task.estimatedTime)} estimados
          </span>
          <Button
            className="ml-auto h-8"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => setEditing(true)}
          >
            Editar
          </Button>
          {isCompleted ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-pastel-green-foreground">
              <CheckIcon aria-hidden="true" className="size-3.5" />
              Concluída
            </span>
          ) : (
            <Button
              className="h-8"
              size="sm"
              type="button"
              variant="outline"
              onClick={() => setCompleting(true)}
            >
              Concluir
            </Button>
          )}
        </div>
      </article>
      <CompleteTaskDialog
        open={completing}
        task={task}
        onComplete={(actualTime) => onComplete(task.id, actualTime)}
        onOpenChange={setCompleting}
      />
      <TaskFormDialog open={editing} task={task} onOpenChange={setEditing} />
    </li>
  )
}
