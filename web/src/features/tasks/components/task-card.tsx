import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDuration } from '@/lib/format-duration'
import { cn } from 'cn'
import { pastelSwatches } from '@/components/pastel'

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
  onDelete: () => void
}

export function TaskCard({
  task,
  onStart,
  onComplete,
  onDelete,
}: TaskCardProps) {
  const [editing, setEditing] = useState(false)
  const [completing, setCompleting] = useState(false)
  const swatch =
    pastelSwatches.find((item) => item.id === task.color) ?? pastelSwatches[1]

  return (
    <article
      className={cn('grid gap-3 rounded-xl border p-4', swatch.className)}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold">{task.title}</h2>
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
        <Button size="sm" type="button" variant="ghost" onClick={onDelete}>
          Excluir
        </Button>
      </div>
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

type CompleteTaskDialogProps = {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (actualTime?: number) => Promise<void>
}

function CompleteTaskDialog({
  task,
  open,
  onOpenChange,
  onComplete,
}: CompleteTaskDialogProps) {
  const measured = Boolean(task.startedAt)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = String(
      new FormData(event.currentTarget).get('actualTime') ?? '',
    )
    const actualTime = value === '' ? undefined : Number(value)

    if (!measured && actualTime === undefined) {
      return
    }

    try {
      await onComplete(actualTime)
      onOpenChange(false)
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Concluir tarefa</DialogTitle>
          <DialogDescription>
            {measured
              ? 'Informe os minutos se quiser corrigir o tempo medido.'
              : 'Informe quantos minutos a tarefa levou.'}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor={`actual-${task.id}`}>Tempo real (min)</Label>
            <Input
              id={`actual-${task.id}`}
              min={0}
              name="actualTime"
              required={!measured}
              type="number"
            />
          </div>
          <DialogFooter>
            <Button type="submit">Concluir</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
