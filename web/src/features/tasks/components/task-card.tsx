import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/format-duration'
import { cn } from 'cn'
import { pastelSwatches } from '@/components/pastel'

import { CompleteTaskDialog } from './complete-task-dialog'
import { TaskAttachmentIndicator } from './task-attachment-indicator'
import { TaskFormDialog } from './task-form-dialog'
import type { Task } from '../types/task'

const statusLabel = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluída',
} as const

const priorityLabel = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
} as const

type TaskCardProps = {
  task: Task
  onStart: () => void
  onComplete: (actualTime?: number) => Promise<void>
  onDelete: () => void | Promise<void>
}

export function TaskCard({
  task,
  onStart,
  onComplete,
  onDelete,
}: TaskCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [completing, setCompleting] = useState(false)
  const swatch =
    pastelSwatches.find((item) => item.id === task.color) ?? pastelSwatches[1]

  return (
    <article
      className={cn('grid gap-3 rounded-xl border p-4', swatch.className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-xl font-semibold">{task.title}</h2>
          <TaskAttachmentIndicator count={task.attachments.length} />
        </div>
        <span className="rounded-full bg-background/70 px-2 py-1 text-xs font-medium text-foreground">
          {statusLabel[task.status]}
        </span>
      </div>
      {task.description ? <p>{task.description}</p> : null}
      <p className="text-sm">
        {task.category} · {priorityLabel[task.priority]} ·{' '}
        {formatDuration(task.estimatedTime)} estimados
        {task.actualTime !== null
          ? ` · ${formatDuration(task.actualTime)} reais`
          : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => {
            setEditing(true)
          }}
        >
          Editar
        </Button>
        {task.status === 'pending' ? (
          <Button size="sm" type="button" onClick={onStart}>
            Iniciar
          </Button>
        ) : null}
        {task.status !== 'completed' ? (
          <Button
            size="sm"
            type="button"
            onClick={() => {
              setCompleting(true)
            }}
          >
            Concluir
          </Button>
        ) : null}
        <Button
          size="sm"
          type="button"
          variant="destructive"
          onClick={() => setConfirmingDelete(true)}
        >
          Excluir
        </Button>
      </div>
      <DeleteConfirmationDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        entity="tarefa"
        name={task.title}
        onConfirm={onDelete}
      />
      <TaskFormDialog open={editing} task={task} onOpenChange={setEditing} />
      <CompleteTaskDialog
        open={completing}
        task={task}
        onComplete={onComplete}
        onOpenChange={setCompleting}
      />
    </article>
  )
}
