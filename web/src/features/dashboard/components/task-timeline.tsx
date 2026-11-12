import { TaskSummary, taskSummaryClassName } from './task-summary'
import { TaskAssignment } from '@/features/tasks/components/task-assignment'
import { taskWindow } from '@/features/tasks/task-kind'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import { AgendaDetails } from '../agenda-page'
import { ArrowLeft, ArrowRight, CircleCheck, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { AgendaCardSkeleton } from './agenda-card-skeleton'
import { cn } from 'cn'
import { MutedText, SectionTitle } from '@/components/typography'
import { sortTasks } from '@/features/tasks/sort-tasks'
import type { Task } from '@/features/tasks/types/task'

import { hapticFeedback } from '@/lib/haptics'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'

type TaskTimelineProps = {
  tasks: Task[]
  onComplete: (taskId: string, actualTime?: number) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
  loading?: boolean
  preview?: boolean
  onViewAll?: () => void
}

const interactiveTarget = 'button, input, textarea, select, a, [role="dialog"]'
const dragThreshold = 8
const actionThreshold = 48
const previewLimit = 3
function TaskSkeletons() {
  return (
    <div
      aria-label="Carregando tarefas"
      role="status"
      className="w-full min-w-0"
    >
      <ol
        aria-hidden="true"
        className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-3"
      >
        {Array.from({ length: 3 }, (_, index) => (
          <li key={index} className="w-full min-w-0">
            <AgendaCardSkeleton task />
          </li>
        ))}
      </ol>
    </div>
  )
}
const swipeTutorialKey = 'colabora:swipe-tutorial'

export function TaskTimeline({
  tasks,
  onComplete,
  onDelete,
  loading = false,
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
  const ordered = sortTasks(
    tasks.filter((task) => task.status !== 'completed'),
    'dueDate',
  )
  const visibleTasks = preview ? ordered.slice(0, previewLimit) : ordered
  const remaining = ordered.length - visibleTasks.length

  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
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
            Para a direita: concluir com tempo calculado automaticamente.
          </p>
          <p className="flex items-center gap-2 text-pastel-red-foreground">
            <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
            Para a esquerda: abrir a confirmação de exclusão.
          </p>
          <p className="text-muted-foreground">
            Arraste na horizontal para agir ou na vertical para rolar a página.
            Solte para realizar a ação; no teclado, foque o card e use as setas.
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
      {loading ? (
        <TaskSkeletons />
      ) : ordered.length === 0 ? (
        <MutedText>
          {tasks.some((task) => task.status === 'completed')
            ? 'Nenhuma tarefa pendente.'
            : 'Nada agendado. As tarefas com data e hora aparecem aqui.'}
        </MutedText>
      ) : (
        <ol className="grid min-w-0 auto-rows-fr grid-cols-[minmax(0,1fr)] gap-3">
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
  const completionPending = useRef(false)
  const [completionError, setCompletionError] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const cardRef = useRef<HTMLElement>(null)
  const rowRef = useRef<HTMLLIElement>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStartX = useRef<number | null>(null)
  const dragStartY = useRef(0)
  const activePointer = useRef<number | null>(null)
  const dragDirection = useRef<'horizontal' | 'vertical' | null>(null)
  const suppressClick = useRef(false)
  const thresholdAction = useRef(0)
  const dragStartOffset = useRef(0)
  const currentOffset = useRef(0)
  const isCompleted = task.status === 'completed'
  const revealProgress = Math.abs(offset) / 96
  const canDelete = task.permissions.delete
  const canComplete = task.permissions.changeStatus && !isCompleted
  const completingSwipe = offset > 0
  const swipeTransition = dragging
    ? 'none'
    : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1), background-color 320ms ease, border-color 320ms ease, border-radius 320ms cubic-bezier(0.22, 1, 0.36, 1)'

  function updateOffset(value: number) {
    const next = Math.max(
      canDelete ? -96 : 0,
      Math.min(canComplete ? 96 : 0, value),
    )
    currentOffset.current = next
    setOffset(next)
  }

  async function complete() {
    if (!canComplete || completionPending.current) return
    completionPending.current = true
    setCompleting(true)
    setCompletionError(null)
    try {
      await onComplete(task.id)
    } catch (error) {
      setCompletionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir. Tente novamente.',
      )
      updateOffset(0)
    } finally {
      completionPending.current = false
      setCompleting(false)
    }
  }

  function startDrag(
    x: number,
    y: number,
    id: number,
    target: EventTarget | null,
  ) {
    if (completionPending.current || activePointer.current !== null)
      return false
    suppressClick.current = false
    if (target instanceof Element && target.closest(interactiveTarget))
      return false
    activePointer.current = id
    dragStartX.current = x
    dragStartY.current = y
    dragStartOffset.current = currentOffset.current
    dragDirection.current = null
    thresholdAction.current = 0
    return true
  }

  function moveDrag(x: number, y: number) {
    if (dragStartX.current === null) return
    const dx = x - dragStartX.current
    const dy = y - dragStartY.current
    if (!dragDirection.current) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < dragThreshold) return
      suppressClick.current = true
      dragDirection.current =
        Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
    }
    if (dragDirection.current !== 'horizontal') return
    setDragging(true)
    updateOffset(dragStartOffset.current + dx)
    const action =
      Math.abs(currentOffset.current) >= actionThreshold
        ? Math.sign(currentOffset.current)
        : 0
    if (action && action !== thresholdAction.current)
      hapticFeedback('threshold')
    thresholdAction.current = action
  }

  function finishDrag(cancelled: boolean) {
    if (activePointer.current === null) return
    const horizontal = dragDirection.current === 'horizontal'
    dragStartX.current = null
    activePointer.current = null
    thresholdAction.current = 0
    setDragging(false)
    if (cancelled) suppressClick.current = true
    if (cancelled || !horizontal) {
      updateOffset(0)
      return
    }
    if (currentOffset.current >= actionThreshold && canComplete) {
      updateOffset(96)
      complete().catch(() => undefined)
    } else if (currentOffset.current <= -actionThreshold && canDelete) {
      updateOffset(-96)
      setConfirmingDelete(true)
    } else {
      updateOffset(0)
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLLIElement>) {
    // Touch uses a non-passive touchmove listener so horizontal swipes can
    // prevent browser scrolling before it cancels the gesture.
    if (
      event.pointerType === 'touch' ||
      event.button !== 0 ||
      event.isPrimary === false
    )
      return
    if (
      startDrag(event.clientX, event.clientY, event.pointerId, event.target)
    ) {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLLIElement>) {
    if (
      event.pointerType === 'touch' ||
      activePointer.current !== event.pointerId
    )
      return
    moveDrag(event.clientX, event.clientY)
  }

  function finishPointerDrag(event: PointerEvent<HTMLLIElement>) {
    if (
      event.pointerType === 'touch' ||
      activePointer.current !== event.pointerId
    )
      return
    if (event.type !== 'pointercancel') moveDrag(event.clientX, event.clientY)
    finishDrag(event.type === 'pointercancel')
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    function touchStart(event: TouchEvent) {
      if (event.touches.length !== 1) {
        finishDrag(true)
        return
      }
      const touch = event.touches[0]
      startDrag(touch.clientX, touch.clientY, touch.identifier, event.target)
    }
    function touchMove(event: TouchEvent) {
      if (event.touches.length !== 1) {
        finishDrag(true)
        return
      }
      const touch = Array.from(event.touches).find(
        (t) => t.identifier === activePointer.current,
      )
      if (!touch) return
      moveDrag(touch.clientX, touch.clientY)
      if (dragDirection.current === 'horizontal' && event.cancelable)
        event.preventDefault()
    }
    function touchEnd(event: TouchEvent) {
      const touch = Array.from(event.changedTouches).find(
        (t) => t.identifier === activePointer.current,
      )
      if (!touch) return
      if (event.type !== 'touchcancel') moveDrag(touch.clientX, touch.clientY)
      finishDrag(event.type === 'touchcancel')
    }
    row.addEventListener('touchstart', touchStart, { passive: true })
    row.addEventListener('touchmove', touchMove, { passive: false })
    row.addEventListener('touchend', touchEnd)
    row.addEventListener('touchcancel', touchEnd)
    return () => {
      row.removeEventListener('touchstart', touchStart)
      row.removeEventListener('touchmove', touchMove)
      row.removeEventListener('touchend', touchEnd)
      row.removeEventListener('touchcancel', touchEnd)
    }
  })

  function closeDetails() {
    setDetailsOpen(false)
  }

  return (
    <li
      ref={rowRef}
      onClick={(event) => {
        if (
          completionPending.current ||
          (suppressClick.current && event.detail !== 0) ||
          !(event.target instanceof Element) ||
          !event.currentTarget.contains(event.target) ||
          event.target.closest(interactiveTarget)
        )
          return
        setDetailsOpen(true)
      }}
      onClickCapture={(event) => {
        if (
          suppressClick.current &&
          event.detail !== 0 &&
          event.target instanceof Node &&
          event.currentTarget.contains(event.target)
        ) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      data-action={completingSwipe ? 'complete' : 'delete'}
      style={
        {
          '--swipe-progress': revealProgress,
          '--swipe-tint': `${revealProgress * 20}%`,
        } as CSSProperties
      }
      className="colabora-timeline-task relative isolate grid min-w-0 touch-auto overflow-hidden rounded-xl"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
      onLostPointerCapture={(event) => {
        if (
          event.pointerType === 'touch' ||
          activePointer.current !== event.pointerId
        )
          return
        activePointer.current = null
        dragStartX.current = null
        thresholdAction.current = 0
        suppressClick.current = true
        setDragging(false)
        updateOffset(0)
      }}
    >
      {canComplete ? (
        <button
          aria-label={`Concluir tarefa ${task.title}`}
          aria-hidden={offset <= 0}
          tabIndex={offset > 0 ? 0 : -1}
          className="absolute inset-y-0 left-0 grid w-24 place-items-center text-green-800 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-800 motion-reduce:transition-none"
          type="button"
          disabled={completing}
          onClick={() => complete().catch(() => undefined)}
        >
          <CircleCheck aria-hidden="true" className="size-6" />
        </button>
      ) : null}
      {canDelete ? (
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
      ) : null}
      <article
        ref={cardRef}
        tabIndex={0}
        aria-busy={completing}
        aria-label={`${task.title}. Enter ou espaço para abrir detalhes.${canDelete ? ' Arraste para a esquerda para excluir.' : ''}${canComplete ? ' Arraste para a direita para concluir.' : ''}`}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (completionPending.current) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setDetailsOpen(true)
          } else if (event.key === 'ArrowLeft' && canDelete) {
            event.preventDefault()
            updateOffset(-96)
            setConfirmingDelete(true)
          } else if (event.key === 'ArrowRight' && canComplete) {
            event.preventDefault()
            updateOffset(96)
            complete().catch(() => undefined)
          } else if (event.key === 'Escape') {
            updateOffset(0)
          }
        }}
        style={{
          transform: `translateX(${offset}px)`,
          borderTopRightRadius: `calc(var(--radius-xl) * ${completingSwipe ? 1 : 1 - revealProgress})`,
          borderBottomRightRadius: `calc(var(--radius-xl) * ${completingSwipe ? 1 : 1 - revealProgress})`,
          borderTopLeftRadius: `calc(var(--radius-xl) * ${completingSwipe ? 1 - revealProgress : 1})`,
          borderBottomLeftRadius: `calc(var(--radius-xl) * ${completingSwipe ? 1 - revealProgress : 1})`,
          transition: swipeTransition,
        }}
        className={cn(
          taskSummaryClassName,
          'content-start active:cursor-grabbing motion-reduce:!transition-none',
        )}
      >
        <TaskSummary task={task}>
          {completing ? (
            <p role="status" className="text-sm text-muted-foreground">
              Concluindo...
            </p>
          ) : null}
          {completionError ? (
            <p role="alert" className="text-sm text-destructive">
              {completionError}
            </p>
          ) : null}
        </TaskSummary>
        <TaskAssignment task={task} />
      </article>
      {detailsOpen ? (
        <AgendaDetails
          item={{
            ...task,
            type: 'task',
            ...taskWindow(task),
            icon: null,
            task,
          }}
          onClose={closeDetails}
          returnFocus={() => cardRef.current?.focus()}
          onComplete={async () => {
            await onComplete(task.id)
            closeDetails()
          }}
          onDelete={async () => {
            await onDelete(task.id)
            closeDetails()
          }}
        />
      ) : null}
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
