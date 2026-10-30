import { useRef, useState, type PointerEvent } from 'react'
import { CheckIcon, Trash2 } from 'lucide-react'

import { pastelSwatches } from '@/components/pastel'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/format-duration'
import { cn } from 'cn'
import { MutedText, SectionTitle } from '@/components/typography'
import { sortTasks } from '@/features/tasks/sort-tasks'
import type { Task } from '@/features/tasks/types/task'

import { CompleteTaskDialog } from '../../tasks/components/complete-task-dialog'
import { TaskFormDialog } from '../../tasks/components/task-form-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type TaskTimelineProps = {
  tasks: Task[]
  onComplete: (taskId: string, actualTime?: number) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
  preview?: boolean
  onViewAll?: () => void
}

const previewLimit = 3

export function TaskTimeline({
  tasks,
  onComplete,
  onDelete,
  preview = false,
  onViewAll,
}: TaskTimelineProps) {
  const ordered = sortTasks(tasks, 'dueDate')
  const visibleTasks = preview ? ordered.slice(0, previewLimit) : ordered
  const remaining = ordered.length - visibleTasks.length

  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>Linha do tempo</SectionTitle>
        {remaining > 0 && onViewAll ? (
          <Button
            className="h-8 rounded-full bg-transparent px-4 text-pastel-green-foreground shadow-none hover:bg-transparent hover:text-pastel-green-foreground hover:underline"
            size="sm"
            type="button"
            variant="ghost"
            onClick={onViewAll}
          >
            Ver tudo
          </Button>
        ) : null}
      </div>
      {ordered.length === 0 ? (
        <MutedText>
          Nada agendado. As tarefas com data e hora aparecem aqui.
        </MutedText>
      ) : (
        <ol className="grid gap-3">
          {visibleTasks.map((task) => (
            <TimelineTask
              key={task.id}
              task={task}
              onComplete={onComplete}
              onDelete={onDelete}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

type TimelineTaskProps = {
  task: Task
  onComplete: TaskTimelineProps['onComplete']
  onDelete: TaskTimelineProps['onDelete']
}

function TimelineTask({ task, onComplete, onDelete }: TimelineTaskProps) {
  const [completing, setCompleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStartX = useRef<number | null>(null)
  const dragStartOffset = useRef(0)
  const currentOffset = useRef(0)
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

  function updateOffset(value: number) {
    const next = Math.max(-96, Math.min(0, value))
    currentOffset.current = next
    setOffset(next)
  }

  function handlePointerDown(event: PointerEvent<HTMLLIElement>) {
    const target = event.target
    if (
      target instanceof Element &&
      target.closest(
        '[data-delete-action], button, input, textarea, select, a, [role="dialog"]',
      )
    ) {
      return
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return

    dragStartX.current = event.clientX
    dragStartOffset.current = currentOffset.current
    setDragging(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent<HTMLLIElement>) {
    if (dragStartX.current === null) return
    updateOffset(dragStartOffset.current + event.clientX - dragStartX.current)
  }

  function finishPointerDrag(event: PointerEvent<HTMLLIElement>) {
    if (dragStartX.current === null) return
    dragStartX.current = null
    setDragging(false)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    updateOffset(currentOffset.current <= -48 ? -96 : 0)
  }

  return (
    <li
      className="relative touch-pan-y overflow-hidden rounded-xl"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
    >
      {offset < 0 ? (
        <div
          className="absolute inset-y-0 right-0 z-20 flex w-24 items-center justify-center rounded-r-xl bg-destructive text-destructive-foreground"
          data-delete-action
          onClick={() => setConfirmingDelete(true)}
        >
          <button
            aria-label={`Excluir tarefa ${task.title}`}
            className="grid size-12 place-items-center rounded-xl text-white transition hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            type="button"
          >
            <Trash2 aria-hidden="true" className="size-6" />
          </button>
        </div>
      ) : null}
      <article
        style={{ transform: `translateX(${offset}px)` }}
        className={cn(
          'relative z-10 grid cursor-grab select-none gap-2 rounded-xl border bg-card p-3 active:cursor-grabbing sm:p-4',
          !dragging && 'transition-transform duration-200 ease-out',
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
      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir tarefa?</DialogTitle>
            <DialogDescription>
              Tem certeza de que deseja excluir “{task.title}”? Essa ação não
              pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancelar
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              type="button"
              onClick={async () => {
                setConfirmingDelete(false)
                updateOffset(0)
                await onDelete(task.id)
              }}
            >
              Excluir tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
