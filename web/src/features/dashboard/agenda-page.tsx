import { showToast } from '@/lib/toast'
import {
  CardSelectionActions,
  SelectionCircle,
  useCardHold,
} from './components/card-selection'
import { AgendaCardSkeleton } from './components/agenda-card-skeleton'
import { hapticFeedback } from '@/lib/haptics'
import {
  googleStatus,
  googleCalendars,
  googleCalendarLinks,
} from '@/features/google/google-api'
import { TaskSummary, taskSummaryClassName } from './components/task-summary'
import { TaskAssigneeBadge } from '@/features/tasks/components/task-assignee-badge'
import { TaskAssignment } from '@/features/tasks/components/task-assignment'
import { apiRequest } from '@/lib/http-client'
import { useAuth } from '@/features/auth/auth-context'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from 'cn'
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CirclePlay,
  Clock3,
  FolderKanban,
  MapPin,
  NotebookPen,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Timer,
  Trash2,
  X,
} from 'lucide-react'

import { MutedText, PageTitle, SectionTitle } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isFutureReminder, ReminderField } from '@/components/reminder-field'
import { GoogleSyncHint } from '@/features/google/google-sync-hint'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTasks } from '@/features/tasks/tasks-context'
import { AgendaAttachmentField } from './components/agenda-attachment-field'
import { AgendaAttachments } from './components/agenda-attachments'
import { LocationField } from '@/features/tasks/components/location-field'
import {
  AgendaUploadError,
  uploadAgendaFiles,
  type AgendaUploadProgress,
} from './upload-agenda-files'
import type { Task } from '@/features/tasks/types/task'
import { TaskExecutionTime } from '@/features/tasks/components/task-execution-time'
import { TaskFormDialog } from '@/features/tasks/components/task-form-dialog'
import { isTimedTask, taskWindow } from '@/features/tasks/task-kind'
import { LinkedText } from '@/components/linked-text'
import {
  formatDate,
  formatTime,
  listAgendaItems,
  overlapsDay,
  removeAgendaItem,
  startOfDay,
  type AgendaItem,
} from './agenda-items'

type AgendaKind = 'event' | 'project' | 'task'
type NormalAgendaItem = Omit<AgendaItem, 'type' | 'startDate' | 'endDate'> & {
  type: AgendaKind
  startDate: string | null
  endDate: string | null
  category?: string
  status?: Task['status']
  task?: Task
}
type SortMode = 'date' | 'name' | 'type'

const taskStatusAppearance = {
  pending: {
    label: 'Pendente',
    icon: Clock3,
    card: 'border-amber-500/50 bg-amber-50/70 hover:border-amber-500 dark:bg-amber-950/20',
    badge:
      'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
  },
  in_progress: {
    label: 'Em andamento',
    icon: CirclePlay,
    card: 'border-sky-500/50 bg-sky-50/70 hover:border-sky-500 dark:bg-sky-950/20',
    badge: 'bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200',
  },
  completed: {
    label: 'Concluída',
    icon: CircleCheck,
    card: 'border-emerald-500/50 bg-emerald-50/70 hover:border-emerald-500 dark:bg-emerald-950/25',
    badge:
      'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
  },
}

const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const icons = [
  { value: '📌', label: 'Alfinete' },
  { value: '💼', label: 'Trabalho' },
  { value: '🎓', label: 'Estudos' },
  { value: '🎉', label: 'Evento' },
  { value: '🏠', label: 'Casa' },
  { value: '✈️', label: 'Viagem' },
]

export function AgendaPage() {
  const {
    tasks,
    loading: tasksLoading,
    completeTask,
    reopenTask,
    removeTask,
  } = useTasks()
  const { user } = useAuth()
  const [items, setItems] = useState<AgendaItem[]>([])
  const [selectedDay, setSelectedDay] = useState(startOfDay(new Date()))
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sort, setSort] = useState<SortMode>('date')
  const [createOpen, setCreateOpen] = useState(false)
  const [details, setDetails] = useState<NormalAgendaItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [calendars, setCalendars] = useState<
    Awaited<ReturnType<typeof googleCalendars>>
  >([])
  const [links, setLinks] = useState<
    Awaited<ReturnType<typeof googleCalendarLinks>>
  >([])
  const [hiddenCalendars, setHiddenCalendars] = useState<string[]>(() => {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(`agenda-hidden:${user?.id}`) ?? '[]',
      )
      return Array.isArray(stored)
        ? stored.filter((id): id is string => typeof id === 'string')
        : []
    } catch {
      return []
    }
  })
  const [calendarError, setCalendarError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    googleStatus()
      .then(async (status) => {
        if (status.status !== 'connected') return
        const [available, sources] = await Promise.all([
          googleCalendars(),
          googleCalendarLinks(),
        ])
        if (active) {
          setCalendars(available)
          setLinks(sources)
        }
      })
      .catch(() => {
        if (active)
          setCalendarError(
            'Não foi possível carregar as agendas do Google. Os itens continuam visíveis.',
          )
      })
    return () => {
      active = false
    }
  }, [])
  function cancelSelection() {
    setSelectionMode(false)
    setSelected(new Set())
  }
  function toggleSelection(item: NormalAgendaItem) {
    if (item.task && !item.task.permissions.delete) return
    const key = `${item.type}-${item.id}`
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function cardProps(item: NormalAgendaItem) {
    return {
      selectionMode,
      selected: selected.has(`${item.type}-${item.id}`),
      onLongPress: () => {
        setSelectionMode(true)
        toggleSelection(item)
        hapticFeedback('threshold')
      },
      onSelect: () =>
        selectionMode ? toggleSelection(item) : setDetails(item),
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    listAgendaItems(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setItems(data)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(messageOf(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const weekDays = useMemo(() => {
    const monday = startOfWeek(selectedDay)
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday)
      date.setDate(date.getDate() + index)
      return date
    })
  }, [selectedDay])

  const allItems = useMemo(
    () =>
      [
        ...tasks.map((task) => ({
          ...task,
          type: 'task' as const,
          ...taskWindow(task),
          icon: null,
          task,
        })),
        ...items,
      ].map(normalizeItem),
    [items, tasks],
  )

  const visibleItems = useMemo(
    () =>
      allItems.filter((item) => {
        const link = links.find(
          (entry) =>
            entry.entityId === item.id &&
            entry.entityType ===
              (item.type === 'task' ? 'task' : 'agenda_item'),
        )
        const source =
          link?.googleCalendarId === 'primary'
            ? (calendars.find((calendar) => calendar.primary)?.id ?? 'primary')
            : (link?.googleCalendarId ?? 'local')
        return !hiddenCalendars.includes(source)
      }),
    [allItems, links, hiddenCalendars, calendars],
  )

  const matchingItems = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR')
    if (!term) return []
    return visibleItems
      .filter((item) =>
        [
          item.title,
          item.description,
          ...item.attachments,
          item.location,
          item.type === 'task' ? item.category : item.icon,
        ].some((field) => field?.toLocaleLowerCase('pt-BR').includes(term)),
      )
      .sort((a, b) => sortItems(a, b, sort))
  }, [visibleItems, query, sort])

  const dayItems = useMemo(
    () =>
      visibleItems
        .filter((item) =>
          overlapsDay(
            item.startDate,
            item.endDate ?? item.startDate,
            selectedDay,
          ),
        )
        .sort((a, b) => sortItems(a, b, 'date')),
    [visibleItems, selectedDay],
  )

  const unscheduledItems = visibleItems.filter((item) => !item.startDate)

  const selectableItems = (
    searchOpen ? matchingItems : [...dayItems, ...unscheduledItems]
  ).filter((item) => !item.task || item.task.permissions.delete)

  async function createItem(
    input: Omit<AgendaItem, 'id' | 'createdAt' | 'updatedAt'> & {
      syncOptOut?: boolean
    },
  ) {
    const saved = await apiRequest<AgendaItem>('/agenda-items', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    setItems((current) => [...current, saved])
    showToast({
      title:
        saved.type === 'event'
          ? 'Evento criado com sucesso'
          : 'Projeto criado com sucesso',
      itemTitle: saved.title,
      description: saved.description ?? undefined,
      variant: 'success',
    })
    setCreateOpen(false)
    setError(null)
  }

  return (
    <div className="grid gap-6 sm:gap-8">
      <div className="flex min-w-0 items-start justify-between gap-3">
        {searchOpen ? (
          <div className="flex items-center gap-2">
            <Button
              aria-label="Voltar à agenda"
              size="icon"
              variant="ghost"
              onClick={() => {
                setSearchOpen(false)
                setQuery('')
              }}
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
            <div className="grid gap-1">
              <PageTitle>Pesquisar</PageTitle>
              <MutedText>Busque em tarefas, eventos e projetos.</MutedText>
            </div>
          </div>
        ) : (
          <div className="grid min-w-0 gap-1">
            <PageTitle>Agenda</PageTitle>
            <MutedText>
              Organize tarefas, eventos e projetos da sua semana.
            </MutedText>
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!searchOpen ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" />
              Adicionar
            </Button>
          ) : null}
          {!searchOpen ? (
            <Button
              aria-label="Pesquisar na agenda"
              className="size-10 rounded-xl"
              size="icon"
              variant="outline"
              onClick={() => setSearchOpen(true)}
            >
              <Search aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>

      <details className="rounded-xl border bg-card p-3">
        <summary className="cursor-pointer font-medium">
          Agendas exibidas
        </summary>
        <div className="mt-3 flex flex-wrap gap-4">
          {[{ id: 'local', summary: 'Colabora' }, ...calendars].map(
            (calendar) => (
              <label
                key={calendar.id}
                className="flex min-h-11 items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={!hiddenCalendars.includes(calendar.id)}
                  onChange={() => {
                    const next = hiddenCalendars.includes(calendar.id)
                      ? hiddenCalendars.filter((id) => id !== calendar.id)
                      : [...hiddenCalendars, calendar.id]
                    setHiddenCalendars(next)
                    cancelSelection()
                    try {
                      localStorage.setItem(
                        `agenda-hidden:${user?.id}`,
                        JSON.stringify(next),
                      )
                    } catch {
                      /* Optional persistence. */
                    }
                  }}
                />
                {calendar.summary}
              </label>
            ),
          )}
        </div>
        {calendarError ? (
          <p role="status" className="text-sm text-muted-foreground">
            {calendarError}
          </p>
        ) : null}
      </details>
      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entity="itens selecionados"
        name={`${selected.size} itens`}
        description={`Excluir ${selected.size} item(ns)? Essa ação não pode ser desfeita.`}
        onConfirm={async () => {
          const failures: string[] = []
          for (const item of allItems.filter((entry) =>
            selected.has(`${entry.type}-${entry.id}`),
          )) {
            try {
              if (item.task && !item.task.permissions.delete)
                throw new Error('Sem permissão')
              if (item.type === 'task') await removeTask(item.id)
              else {
                await removeAgendaItem(item.id)
                setItems((current) =>
                  current.filter((entry) => entry.id !== item.id),
                )
              }
              setSelected((current) => {
                const next = new Set(current)
                next.delete(`${item.type}-${item.id}`)
                return next
              })
            } catch {
              failures.push(item.title)
            }
          }
          if (failures.length)
            throw new Error(
              `Não foi possível excluir: ${failures.join(', ')}. Os demais itens foram excluídos.`,
            )
          cancelSelection()
        }}
      />
      {!searchOpen ? (
        <section
          aria-label="Semana"
          className="surface-panel grid gap-3 rounded-2xl border p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>{monthLabel(weekDays[0])}</SectionTitle>
            <div className="flex items-center gap-1">
              <Button
                aria-label="Semana anterior"
                size="icon"
                variant="ghost"
                onClick={() => setSelectedDay((day) => shiftDate(day, -7))}
              >
                <ChevronLeft />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedDay(startOfDay(new Date()))
                }}
              >
                Hoje
              </Button>
              <Button
                aria-label="Próxima semana"
                size="icon"
                variant="ghost"
                onClick={() => setSelectedDay((day) => shiftDate(day, 7))}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {weekDays.map((day) => {
              const selected = sameDay(day, selectedDay)
              const count = visibleItems.filter((item) =>
                overlapsDay(item.startDate, item.endDate, day),
              ).length
              return (
                <button
                  key={day.toISOString()}
                  aria-pressed={selected}
                  className={`grid justify-items-center gap-1 rounded-xl px-1 py-2 text-xs transition sm:py-3 sm:text-sm ${selected ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-accent'}`}
                  onClick={() => {
                    setSelectedDay(startOfDay(day))
                  }}
                >
                  <span>{weekdays[day.getDay()]}</span>
                  <span className="text-base font-semibold sm:text-lg">
                    {day.getDate()}
                  </span>
                  <span
                    aria-label={`${count} itens`}
                    className={`size-1.5 rounded-full ${count ? (selected ? 'bg-primary-foreground' : 'bg-primary') : 'bg-transparent'}`}
                  />
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {searchOpen ? (
        <section
          aria-label="Pesquisar agenda"
          className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        >
          <div className="grid gap-2">
            <Label htmlFor="agenda-search">
              Pesquisar tarefas, eventos e projetos
            </Label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                autoFocus
                aria-label="Pesquisar tarefas, eventos e projetos"
                className="pl-9"
                id="agenda-search"
                placeholder="Título, descrição, arquivo, local ou ícone"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            <span>Ordenar</span>
            <select
              aria-label="Ordenar resultados"
              className="h-9 rounded-lg border bg-background px-2 text-foreground"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
            >
              <option value="date">Data</option>
              <option value="name">Nome</option>
              <option value="type">Tipo</option>
            </select>
          </label>
        </section>
      ) : null}

      {error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {selectionMode ? (
        <CardSelectionActions
          count={selected.size}
          allSelected={
            selectableItems.length > 0 &&
            selectableItems.every((item) =>
              selected.has(`${item.type}-${item.id}`),
            )
          }
          onToggleAll={() => {
            const keys = selectableItems.map(
              (item) => `${item.type}-${item.id}`,
            )
            setSelected(
              new Set(keys.every((key) => selected.has(key)) ? [] : keys),
            )
          }}
          onCancel={cancelSelection}
          onDelete={() => setDeleteOpen(true)}
        />
      ) : null}
      {loading || tasksLoading ? (
        <AgendaSkeleton />
      ) : searchOpen && query.trim() ? (
        <section className="grid gap-3" aria-live="polite">
          <SectionTitle>
            Resultados da pesquisa ({matchingItems.length})
          </SectionTitle>
          {matchingItems.length ? (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-3 sm:grid-cols-2">
              {matchingItems.map((item) => (
                <AgendaCard
                  key={`${item.type}-${item.id}`}
                  item={item}
                  {...cardProps(item)}
                />
              ))}
            </div>
          ) : (
            <Empty>No momento, nada corresponde à pesquisa.</Empty>
          )}
        </section>
      ) : searchOpen ? (
        <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed bg-card p-8 text-center">
          <div className="grid justify-items-center gap-2">
            <span className="grid size-12 place-items-center rounded-full bg-secondary text-primary">
              <Search aria-hidden="true" />
            </span>
            <SectionTitle>O que você está procurando?</SectionTitle>
            <MutedText>
              Pesquise por título, descrição, arquivo, local ou ícone.
            </MutedText>
          </div>
        </div>
      ) : (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <SectionTitle>
                {sameDay(selectedDay, startOfDay(new Date()))
                  ? 'Hoje'
                  : formatDate(selectedDay)}
              </SectionTitle>
              <MutedText>
                {dayItems.length} {dayItems.length === 1 ? 'item' : 'itens'}{' '}
                neste dia
              </MutedText>
            </div>
          </div>
          {dayItems.length ? (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-3 sm:grid-cols-2">
              {dayItems.map((item) => (
                <AgendaCard
                  key={`${item.type}-${item.id}`}
                  item={item}
                  {...cardProps(item)}
                />
              ))}
            </div>
          ) : (
            <Empty>Dia livre. Adicione um evento ou projeto à agenda.</Empty>
          )}
        </section>
      )}

      {!loading && !tasksLoading && !searchOpen && unscheduledItems.length ? (
        <section aria-label="Tarefas sem data" className="grid gap-3">
          <SectionTitle>Sem data</SectionTitle>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-3 sm:grid-cols-2">
            {unscheduledItems.map((item) => (
              <AgendaCard
                key={`${item.type}-${item.id}`}
                item={item}
                {...cardProps(item)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <AgendaCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={createItem}
      />
      <AgendaDetails
        key={details ? `${details.type}-${details.id}` : 'closed'}
        item={
          details?.type === 'task'
            ? (allItems.find(
                (item) => item.type === 'task' && item.id === details.id,
              ) ?? null)
            : details
        }
        onClose={() => setDetails(null)}
        onAttachmentSaved={(saved) => {
          setItems((current) =>
            current.map((entry) => (entry.id === saved.id ? saved : entry)),
          )
          setDetails((current) =>
            current?.id === saved.id && current.type !== 'task'
              ? saved
              : current,
          )
        }}
        onComplete={async (task) => {
          await completeTask(task.id)
          setDetails(null)
        }}
        onReopen={async (task) => {
          await reopenTask(task.id)
          setDetails(null)
        }}
        onDelete={async (item) => {
          if (item.type === 'task') {
            await removeTask(item.id)
            setDetails(null)
            return
          }
          await removeAgendaItem(item.id)
          setItems((current) => current.filter((entry) => entry.id !== item.id))
          setDetails(null)
        }}
      />
    </div>
  )
}

function AgendaSkeleton() {
  return (
    <section
      role="status"
      aria-label="Carregando agenda"
      className="grid gap-3"
    >
      <span className="sr-only">Carregando agenda...</span>
      <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <AgendaCardSkeleton key={index} />
        ))}
      </div>
    </section>
  )
}

function AgendaCard({
  item,
  onSelect,
  onLongPress,
  selectionMode,
  selected,
}: {
  onLongPress: () => void
  selectionMode: boolean
  selected: boolean
  item: ReturnType<typeof normalizeItem>
  onSelect: () => void
}) {
  const hold = useCardHold()
  const origin = useRef({ x: 0, y: 0 })
  const canSelect = !item.task || item.task.permissions.delete
  const interactions = {
    role: selectionMode ? 'checkbox' : undefined,
    'aria-checked': selectionMode ? selected : undefined,
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        return
      }
      if (!selectionMode && event.shiftKey && event.key === ' ') {
        event.preventDefault()
        if (canSelect) onLongPress()
      }
    },
    disabled: selectionMode && !canSelect,
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || !canSelect) return
      origin.current = { x: event.clientX, y: event.clientY }
      hold.start(onLongPress)
    },
    onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (
        Math.hypot(
          event.clientX - origin.current.x,
          event.clientY - origin.current.y,
        ) > 10
      )
        hold.cancel()
    },
    onPointerUp: hold.cancel,
    onPointerCancel: hold.cancel,
    onPointerLeave: hold.cancel,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    onClick: () => {
      if (!hold.consume()) onSelect()
    },
  }
  const selectionClass = selected ? 'ring-2 ring-primary' : ''
  if (item.type === 'task' && item.task) {
    return (
      <button
        type="button"
        {...interactions}
        className={cn(
          taskSummaryClassName,
          selectionClass,
          'touch-pan-y select-none [-webkit-touch-callout:none]',
          'text-left transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <TaskSummary
          task={item.task}
          linkDescription={false}
          titlePrefix={
            selectionMode ? <SelectionCircle checked={selected} /> : undefined
          }
          footer={
            <>
              <AgendaTaskStatus status={item.task.status} />
              {item.task.status === 'completed' ? (
                <TaskExecutionTime task={item.task} compact />
              ) : null}
            </>
          }
        />
      </button>
    )
  }
  const task = item.type === 'task'
  const status = task && item.status ? taskStatusAppearance[item.status] : null
  return (
    <button
      className={cn(
        'surface-card grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-2xl border p-4 text-left transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        status?.card ?? 'bg-card hover:border-primary/40',
        selectionClass,
        'touch-pan-y select-none [-webkit-touch-callout:none]',
      )}
      {...interactions}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
            {task ? (
              <CalendarDays className="size-4" />
            ) : (
              item.icon || <FolderKanban className="size-4" />
            )}
          </span>
          <div className="min-w-0 overflow-hidden">
            <div className="flex min-w-0 items-center gap-2">
              {selectionMode ? <SelectionCircle checked={selected} /> : null}
              <p className="truncate font-semibold" title={item.title}>
                {item.title}
              </p>
            </div>
            <p className="text-xs capitalize text-muted-foreground [overflow-wrap:anywhere]">
              {task
                ? `Tarefa · ${item.category}`
                : item.type === 'event'
                  ? 'Evento'
                  : 'Projeto'}
            </p>
          </div>
        </div>
        <span className="whitespace-nowrap rounded-full bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">
          {item.startDate ? formatTime(item.startDate) : 'Sem data'}
        </span>
      </div>
      {task && item.status ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <AgendaTaskStatus status={item.status} />
          {item.task?.status === 'completed' ? (
            <TaskExecutionTime task={item.task} compact />
          ) : null}
        </div>
      ) : null}
      {item.description ? (
        <p className="line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {item.description}
        </p>
      ) : null}
      <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
        {item.startDate && item.endDate ? (
          <span>
            {formatDate(item.startDate)}
            {!sameCalendarDate(item.startDate, item.endDate)
              ? ` – ${formatDate(item.endDate)}`
              : ''}
          </span>
        ) : null}
        {item.location ? (
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="size-3 shrink-0" />
            <span className="min-w-0">{item.location}</span>
          </span>
        ) : null}
        {item.attachments.length ? (
          <span>{item.attachments.length} anexo(s)</span>
        ) : null}
      </div>
    </button>
  )
}

function TaskKindLabel({ task }: { task: Task }) {
  const timed = isTimedTask(task)
  const Icon = timed ? Timer : NotebookPen
  return (
    <span className="inline-flex max-w-[55%] items-center justify-end gap-1.5 text-right text-xs text-muted-foreground">
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {timed ? 'tarefa cronometrada' : 'tarefa agendada'}
    </span>
  )
}

function AgendaTaskStatus({ status }: { status: Task['status'] }) {
  const appearance = taskStatusAppearance[status]
  const Icon = appearance.icon
  return (
    <span
      aria-label={`Situação: ${appearance.label}`}
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        appearance.badge,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {appearance.label}
    </span>
  )
}

export function AgendaDetails({
  item,
  onClose,
  onComplete,
  onReopen,
  onDelete,
  onAttachmentSaved,
  returnFocus,
}: {
  item: NormalAgendaItem | null
  onClose: () => void
  onComplete?: (task: Task) => Promise<void>
  onReopen?: (task: Task) => Promise<void>
  onDelete: (item: NormalAgendaItem) => Promise<void>
  onAttachmentSaved?: (item: AgendaItem) => void
  returnFocus?: () => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [reopenError, setReopenError] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const task = item?.type === 'task' ? (item.task ?? null) : null
  const openedId = item?.id ?? null
  useEffect(() => {
    setEditing(false)
  }, [openedId])
  const entity =
    item?.type === 'task'
      ? 'tarefa'
      : item?.type === 'event'
        ? 'evento'
        : 'projeto'
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={
          returnFocus
            ? (event) => {
                event.preventDefault()
                returnFocus()
              }
            : undefined
        }
        className="flex max-h-[85svh] flex-col overflow-hidden sm:max-w-lg [overflow-wrap:anywhere]"
      >
        <DialogHeader className="shrink-0 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="min-w-0 leading-snug">
              {item?.title ?? 'Detalhes'}
            </DialogTitle>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Fechar"
              >
                <X aria-hidden="true" />
              </Button>
            </DialogClose>
          </div>
          <div className="flex items-center justify-between gap-2">
            <DialogDescription className="min-w-0">
              {item?.type === 'task'
                ? `Tarefa · ${item.category}`
                : item?.type === 'event'
                  ? 'Evento'
                  : 'Projeto'}
            </DialogDescription>
            {task?.permissions.edit ? (
              <Button
                aria-label="Editar tarefa"
                className="-mr-2"
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={() => setEditing(true)}
              >
                <Pencil aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          {item &&
            (item.startDate ? (
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Início</p>
                  <p>
                    {formatDate(item.startDate)} · {formatTime(item.startDate)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Final</p>
                  <p>
                    {item.endDate
                      ? `${formatDate(item.endDate)} · ${formatTime(item.endDate)}`
                      : task?.status === 'completed'
                        ? 'Não registrado'
                        : 'Em andamento'}
                  </p>
                </div>
              </div>
            ) : (
              <MutedText>Sem data agendada.</MutedText>
            ))}
        </DialogHeader>
        {item ? (
          <div className="-mx-3 grid min-h-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto px-3 pb-3 text-sm">
            {task ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <AgendaTaskStatus status={task.status} />
                  <TaskKindLabel task={task} />
                </div>
                <TaskAssigneeBadge task={task} showLabel />
                <TaskAssignment task={task} />
                <TaskExecutionTime task={task} />
              </>
            ) : null}
            <section
              aria-label="Descrição"
              className="grid min-w-0 gap-2 rounded-2xl border border-zinc-200/80 bg-zinc-50/90 p-4 dark:border-zinc-700/70 dark:bg-zinc-900/55"
            >
              <h3 className="text-xs font-semibold text-muted-foreground">
                Descrição
              </h3>
              <p className="whitespace-pre-wrap leading-relaxed text-foreground/85 [overflow-wrap:anywhere]">
                <LinkedText>{item.description || 'Sem descrição.'}</LinkedText>
              </p>
            </section>
            {item.location?.trim() ? (
              <section
                aria-labelledby="agenda-location-heading"
                className="grid min-w-0 gap-2"
              >
                <h3 id="agenda-location-heading" className="font-medium">
                  Localização
                </h3>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {item.location}
                </p>
                <LocationPreview location={item.location} />
              </section>
            ) : null}
            {item.type !== 'task' && onAttachmentSaved ? (
              <AgendaAttachmentField
                key={item.id}
                itemId={item.id}
                count={item.attachments.length}
                onSaved={onAttachmentSaved}
              />
            ) : null}
            {item.attachments.length ? (
              <AgendaAttachments attachments={item.attachments} />
            ) : null}
            <div className="grid gap-2 empty:hidden">
              {task?.permissions.changeStatus &&
              task.status === 'completed' &&
              onReopen ? (
                <Button
                  disabled={reopening}
                  onClick={async () => {
                    setReopening(true)
                    setReopenError(null)
                    try {
                      await onReopen(task)
                    } catch (cause) {
                      setReopenError(messageOf(cause))
                    } finally {
                      setReopening(false)
                    }
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                  {reopening ? 'Reabrindo...' : 'Reabrir tarefa'}
                </Button>
              ) : null}
              {reopenError ? (
                <p className="text-sm text-destructive" role="alert">
                  {reopenError}
                </p>
              ) : null}
              {task?.permissions.changeStatus &&
              task.status !== 'completed' &&
              onComplete ? (
                <Button
                  disabled={completing}
                  aria-busy={completing}
                  onClick={async () => {
                    setCompleting(true)
                    setCompleteError(null)
                    try {
                      await onComplete(task)
                    } catch (cause) {
                      setCompleteError(messageOf(cause))
                    } finally {
                      setCompleting(false)
                    }
                  }}
                >
                  {completing ? 'Concluindo...' : 'Concluir tarefa'}
                </Button>
              ) : null}
              {completeError ? (
                <p className="text-sm text-destructive" role="alert">
                  {completeError}
                </p>
              ) : null}
              {!task || task.permissions.delete ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 aria-hidden="true" />
                  Excluir {entity}
                </Button>
              ) : null}
            </div>
            <DeleteConfirmationDialog
              open={confirmingDelete}
              onOpenChange={setConfirmingDelete}
              entity={entity}
              name={item.title}
              onConfirm={() => onDelete(item)}
            />
            {task ? (
              <TaskFormDialog
                open={editing}
                task={task}
                onOpenChange={setEditing}
              />
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function AgendaCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (
    input: Omit<AgendaItem, 'id' | 'createdAt' | 'updatedAt'> & {
      syncOptOut?: boolean
    },
  ) => Promise<void>
}) {
  const { user } = useAuth()
  const [type, setType] = useState<'event' | 'project'>('event')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reminderOffsets, setReminderOffsets] = useState<number[]>([])
  const [syncOptOut, setSyncOptOut] = useState(false)
  const [location, setLocation] = useState('')
  const [icon, setIcon] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] =
    useState<AgendaUploadProgress | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadController = useRef<AbortController | null>(null)
  const uploadRequest = useRef(0)
  const stopUpload = useCallback(() => {
    uploadRequest.current += 1
    uploadController.current?.abort()
    uploadController.current = null
    setUploading(false)
    setUploadProgress(null)
  }, [])
  function reset() {
    stopUpload()
    setTitle('')
    setDescription('')
    setStartDate('')
    setEndDate('')
    setReminderOffsets([])
    setLocation('')
    setIcon('')
    setFiles([])
    setError('')
  }
  useEffect(() => {
    if (open) return
    stopUpload()
  }, [open, stopUpload])
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Adicionar à agenda</DialogTitle>
          <DialogDescription>
            Crie um evento ou projeto com período, local e documentos.
          </DialogDescription>
        </DialogHeader>
        <form
          className="-mx-3 grid min-h-0 gap-4 overflow-x-hidden overflow-y-auto px-3 pb-3"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!title.trim() || !startDate || !endDate) {
              setError('Preencha título, início e data final.')
              return
            }
            if (new Date(endDate) < new Date(startDate)) {
              setError('A data final deve ser posterior à data inicial.')
              return
            }
            if (
              reminderOffsets.some(
                (minutes) => !isFutureReminder(startDate, minutes),
              )
            ) {
              setError(
                'Um lembrete já passou. Remova-o ou altere a data de início.',
              )
              return
            }
            setSaving(true)
            setError('')
            try {
              await onCreate({
                title: title.trim(),
                type,
                description: description.trim() || null,
                startDate: new Date(startDate).toISOString(),
                endDate: new Date(endDate).toISOString(),
                reminderOffsets,
                location: location || null,
                attachments: files,
                icon: icon || null,
                ...(syncOptOut ? { syncOptOut: true } : {}),
              })
            } catch (cause) {
              setError(messageOf(cause))
            } finally {
              setSaving(false)
            }
          }}
        >
          <div
            className="grid grid-cols-2 gap-2"
            role="group"
            aria-label="Tipo"
          >
            <Button
              type="button"
              variant={type === 'event' ? 'default' : 'outline'}
              onClick={() => setType('event')}
            >
              Evento
            </Button>
            <Button
              type="button"
              variant={type === 'project' ? 'default' : 'outline'}
              onClick={() => setType('project')}
            >
              Projeto
            </Button>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="agenda-title">Título</Label>
            <Input
              id="agenda-title"
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Nome do evento ou projeto"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="agenda-description">Descrição</Label>
            <textarea
              id="agenda-description"
              className="min-h-24 rounded-lg border bg-transparent p-3 text-sm"
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Detalhes importantes..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="agenda-start">Data de início</Label>
              <Input
                id="agenda-start"
                type="datetime-local"
                value={startDate}
                onChange={(event) => {
                  const next = event.target.value
                  setStartDate(next)
                  setReminderOffsets((offsets) =>
                    offsets.filter((minutes) =>
                      isFutureReminder(next, minutes),
                    ),
                  )
                  if (!endDate) setEndDate(event.target.value)
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="agenda-end">Data final</Label>
              <Input
                id="agenda-end"
                type="datetime-local"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>
          <ReminderField
            start={startDate}
            value={reminderOffsets}
            onChange={setReminderOffsets}
          />
          <GoogleSyncHint optOut={syncOptOut} onOptOut={setSyncOptOut} />
          <div className="grid gap-2">
            <Label htmlFor="agenda-icon">Ícone</Label>
            <select
              id="agenda-icon"
              className="h-10 rounded-lg border bg-background px-3"
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
            >
              <option value="">Sem ícone</option>
              {icons.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.value} {item.label}
                </option>
              ))}
            </select>
          </div>
          <LocationField
            id="agenda-location"
            value={location}
            onChange={setLocation}
          />
          <div className="grid gap-2">
            <Label htmlFor="agenda-files">Enviar documentos</Label>
            <input
              ref={fileInput}
              className="sr-only"
              id="agenda-files"
              multiple
              type="file"
              disabled={uploading}
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? [])
                event.target.value = ''
                if (!selected.length || !user) return
                const room = 10 - files.length
                if (room <= 0) {
                  setError('A agenda aceita no máximo 10 arquivos.')
                  return
                }
                const batch = selected.slice(0, room)
                setError(
                  batch.length < selected.length
                    ? 'A agenda aceita no máximo 10 arquivos. Os excedentes não foram enviados.'
                    : '',
                )
                stopUpload()
                const current = ++uploadRequest.current
                const controller = new AbortController()
                uploadController.current = controller
                setUploading(true)
                setUploadProgress(null)
                uploadAgendaFiles(batch, user.id, {
                  signal: controller.signal,
                  onProgress: (progress) => {
                    if (current === uploadRequest.current)
                      setUploadProgress(progress)
                  },
                })
                  .then((uploaded) => {
                    if (current !== uploadRequest.current) return
                    setFiles((existing) => rememberFiles(existing, uploaded))
                  })
                  .catch((cause: unknown) => {
                    if (current !== uploadRequest.current) return
                    if (
                      cause instanceof AgendaUploadError &&
                      cause.completed.length
                    ) {
                      setFiles((existing) =>
                        rememberFiles(existing, cause.completed),
                      )
                    }
                    setError(messageOf(cause))
                  })
                  .finally(() => {
                    if (current !== uploadRequest.current) return
                    uploadController.current = null
                    setUploading(false)
                    setUploadProgress(null)
                  })
              }}
            />
            <Button
              className="h-11 w-full bg-muted text-black hover:bg-muted/80 dark:text-foreground"
              disabled={uploading || files.length >= 10}
              type="button"
              variant="outline"
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip aria-hidden="true" />
              Escolher arquivo
            </Button>
            <MutedText>
              {files.length
                ? files.map((file) => file.split('||')[0]).join(', ')
                : 'Até 10 arquivos, máximo de 10 MB cada.'}
            </MutedText>
            {uploading ? (
              <div className="grid gap-2">
                <p role="status">
                  {uploadProgress
                    ? `Enviando ${uploadProgress.index} de ${uploadProgress.total}${
                        uploadProgress.percentage == null
                          ? ''
                          : ` · ${uploadProgress.percentage}%`
                      }`
                    : 'Enviando documentos...'}
                </p>
                {uploadProgress?.percentage == null ? null : (
                  <div
                    aria-label={`Envio do arquivo ${uploadProgress.index} de ${uploadProgress.total}`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={uploadProgress.percentage}
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                  >
                    <div
                      className="h-full bg-primary motion-safe:transition-[width]"
                      style={{ width: `${uploadProgress.percentage}%` }}
                    />
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    uploadController.current?.abort()
                  }}
                >
                  Cancelar envio
                </Button>
              </div>
            ) : null}
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            className="w-full"
            disabled={saving || uploading}
            type="submit"
          >
            {saving ? 'Salvando...' : 'Salvar na agenda'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LocationPreview({ location }: { location: string }) {
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const url = new URL('https://photon.komoot.io/api/')
    url.searchParams.set('q', location)
    url.searchParams.set('limit', '1')
    fetch(url, { signal: controller.signal })
      .then((response) => response.json())
      .then(
        (body: {
          features?: Array<{ geometry: { coordinates: [number, number] } }>
        }) => setCoordinates(body.features?.[0]?.geometry.coordinates ?? null),
      )
      .catch(() => setCoordinates(null))
    return () => controller.abort()
  }, [location])
  if (!coordinates)
    return (
      <a
        className="text-primary underline"
        href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(location)}`}
        rel="noreferrer"
        target="_blank"
      >
        Abrir localização no mapa
      </a>
    )
  const [longitude, latitude] = coordinates
  const bbox = [
    longitude - 0.008,
    latitude - 0.006,
    longitude + 0.008,
    latitude + 0.006,
  ].join(',')
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`
  return (
    <div className="grid gap-1 overflow-hidden rounded-xl border">
      <iframe
        className="h-44 w-full"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src={src}
        title={`Mapa de ${location}`}
      />
      <a
        className="px-3 py-2 text-xs text-primary underline"
        href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`}
        rel="noreferrer"
        target="_blank"
      >
        Abrir mapa completo
      </a>
    </div>
  )
}

function normalizeItem(
  item:
    | AgendaItem
    | (Task & {
        type: 'task'
        startDate: string | null
        endDate: string | null
        icon: null
        task: Task
      }),
): NormalAgendaItem {
  if ('category' in item) return { ...item, type: 'task', task: item.task }
  return item
}
function sortItems(a: NormalAgendaItem, b: NormalAgendaItem, sort: SortMode) {
  if (sort === 'name') return a.title.localeCompare(b.title, 'pt-BR')
  if (sort === 'type') return a.type.localeCompare(b.type)
  if (!a.startDate) return b.startDate ? 1 : 0
  if (!b.startDate) return -1
  return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
}
function shiftDate(date: Date, amount: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + amount)
  return startOfDay(copy)
}
function startOfWeek(date: Date) {
  const copy = startOfDay(date)
  const offset = (copy.getDay() + 6) % 7
  copy.setDate(copy.getDate() - offset)
  return copy
}
function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString()
}
function sameCalendarDate(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}
function monthLabel(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-4 py-8 text-center">
      <MutedText>{children}</MutedText>
    </div>
  )
}
function rememberFiles(
  current: string[],
  uploaded: Array<{ name: string; url: string }>,
) {
  return [
    ...current,
    ...uploaded
      .filter((file) => file.url.startsWith('/uploads/agenda/'))
      .map((file) => `${file.name}||${file.url}`),
  ].slice(0, 10)
}
function messageOf(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : 'Não foi possível completar a ação.'
}
