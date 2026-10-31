import { useRef, useState, type PointerEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckIcon,
  CircleCheck,
  MapPin,
  Trash2,
} from 'lucide-react'

import { pastelSwatches } from '@/components/pastel'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/format-duration'
import { cn } from 'cn'
import { MutedText, SectionTitle } from '@/components/typography'
import { sortTasks } from '@/features/tasks/sort-tasks'
import type { Task } from '@/features/tasks/types/task'

import { CompleteTaskDialog } from '../../tasks/components/complete-task-dialog'
import { TaskAttachmentIndicator } from '../../tasks/components/task-attachment-indicator'
import { TaskFormDialog } from '../../tasks/components/task-form-dialog'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'

type TaskTimelineProps = {
  tasks: Task[]
  onComplete: (taskId: string, actualTime?: number) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
  preview?: boolean
  onViewAll?: () => void
}

const previewLimit = 3
const swipeTutorialKey = 'colabora:swipe-tutorial'

export function TaskTimeline({
  tasks,
  onComplete,
  onDelete,
  preview = false,
  onViewAll,
}: TaskTimelineProps) {
  const [showSwipeTutorial, setShowSwipeTutorial] = useState(() => {
    try {
      return sessionStorage.getItem(swipeTutorialKey) !== 'seen'
    } catch {
      return true
    }
  })
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
      {visibleTasks.length > 0 && showSwipeTutorial ? (
        <aside
          aria-label="Como arrastar as tarefas"
          className="grid gap-3 rounded-xl border bg-card p-4 text-sm"
        >
          <p className="font-semibold">Arraste o card para agir</p>
          <p className="flex items-center gap-2 text-pastel-green-foreground">
            <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
            Para a direita: concluir e informar o tempo gasto.
          </p>
          <p className="flex items-center gap-2 text-pastel-red-foreground">
            <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
            Para a esquerda: abrir a confirmação de exclusão.
          </p>
          <p className="text-muted-foreground">
            Solte o card para abrir a ação. No teclado, foque o card e use as
            setas.
          </p>
          <Button
            className="justify-self-start"
            size="sm"
            variant="outline"
            type="button"
            onClick={() => {
              setShowSwipeTutorial(false)
              try {
                sessionStorage.setItem(swipeTutorialKey, 'seen')
              } catch {
                // Keep the tutorial dismissible when browser storage is unavailable.
              }
            }}
          >
            Entendi
          </Button>
        </aside>
      ) : null}
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
  const revealProgress = Math.abs(offset) / 96
  const completingSwipe = offset > 0
  const swipeColor = completingSwipe ? '#bbf7d0' : 'var(--pastel-red)'
  const swipeTransition = dragging
    ? 'none'
    : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1), background-color 320ms ease, border-color 320ms ease, border-radius 320ms cubic-bezier(0.22, 1, 0.36, 1)'

  function updateOffset(value: number) {
    const next = Math.max(-96, Math.min(isCompleted ? 0 : 96, value))
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
    if (event.type === 'pointercancel') {
      updateOffset(0)
      return
    }
    if (currentOffset.current >= 48 && !isCompleted) {
      updateOffset(96)
      setCompleting(true)
    } else if (currentOffset.current <= -48) {
      updateOffset(-96)
      setConfirmingDelete(true)
    } else {
      updateOffset(0)
    }
  }

  return (
    <li
      style={{ backgroundColor: completingSwipe ? '#bbf7d0' : undefined }}
      className={cn(
        'relative isolate touch-pan-y overflow-hidden rounded-xl',
        completingSwipe ? 'bg-pastel-green' : 'bg-pastel-red',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
    >
      {!isCompleted ? (
        <button
          aria-label={`Concluir tarefa ${task.title}`}
          aria-hidden={offset <= 0}
          tabIndex={offset > 0 ? 0 : -1}
          className="absolute inset-y-0 left-0 grid w-24 place-items-center text-green-800 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-800 motion-reduce:transition-none"
          type="button"
          onClick={() => setCompleting(true)}
        >
          <CircleCheck aria-hidden="true" className="size-6" />
        </button>
      ) : null}
      <button
        aria-label={`Excluir tarefa ${task.title}`}
        aria-hidden={offset >= 0}
        tabIndex={offset < 0 ? 0 : -1}
        className="absolute inset-y-0 right-0 grid w-24 place-items-center text-pastel-red-foreground transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pastel-red-foreground motion-reduce:transition-none"
        data-delete-action
        type="button"
        onClick={() => setConfirmingDelete(true)}
      >
        <Trash2 aria-hidden="true" className="size-6" />
      </button>
      <article
        tabIndex={0}
        aria-label={`${task.title}. Arraste para a esquerda para excluir${isCompleted ? '' : ' ou para a direita para concluir'}.`}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            updateOffset(-96)
            setConfirmingDelete(true)
          } else if (event.key === 'ArrowRight' && !isCompleted) {
            event.preventDefault()
            updateOffset(96)
            setCompleting(true)
          } else if (event.key === 'Escape') {
            updateOffset(0)
          }
        }}
        style={{
          transform: `translateX(${offset}px)`,
          backgroundColor: `color-mix(in srgb, var(--card), ${swipeColor} ${revealProgress * 100}%)`,
          borderColor: `color-mix(in srgb, var(--border), ${swipeColor} ${revealProgress * 100}%)`,
          borderTopRightRadius: `calc(var(--radius-xl) * ${completingSwipe ? 1 : 1 - revealProgress})`,
          borderBottomRightRadius: `calc(var(--radius-xl) * ${completingSwipe ? 1 : 1 - revealProgress})`,
          borderTopLeftRadius: `calc(var(--radius-xl) * ${completingSwipe ? 1 - revealProgress : 1})`,
          borderBottomLeftRadius: `calc(var(--radius-xl) * ${completingSwipe ? 1 - revealProgress : 1})`,
          transition: swipeTransition,
        }}
        className={cn(
          'relative z-10 grid cursor-grab select-none gap-2 rounded-xl border bg-card p-3 active:cursor-grabbing motion-reduce:!transition-none sm:p-4',
          isCompleted && 'opacity-70',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <MutedText>{dateLabel}</MutedText>
          <span className="rounded-lg bg-primary px-2.5 py-1.5 text-sm font-semibold tabular-nums text-primary-foreground">
            {timeLabel}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="font-semibold leading-snug">{task.title}</h3>
          <TaskAttachmentIndicator count={task.attachments.length} />
        </div>
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
          ) : null}
        </div>
        {task.location?.trim() ? (
          <p className="flex items-start gap-1 text-xs leading-relaxed text-muted-foreground">
            <MapPin aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 break-words">{task.location}</span>
          </p>
        ) : null}
      </article>
      <CompleteTaskDialog
        open={completing}
        task={task}
        onComplete={(actualTime) => onComplete(task.id, actualTime)}
        onOpenChange={(open) => {
          setCompleting(open)
          if (!open) updateOffset(0)
        }}
      />
      <TaskFormDialog open={editing} task={task} onOpenChange={setEditing} />
      <DeleteConfirmationDialog
        open={confirmingDelete}
        entity="tarefa"
        name={task.title}
        onOpenChange={(open) => {
          setConfirmingDelete(open)
          if (!open) updateOffset(0)
        }}
        onConfirm={() => onDelete(task.id)}
      />
    </li>
  )
}
