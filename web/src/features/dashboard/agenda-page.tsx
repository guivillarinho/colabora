import { apiBase, apiRequest } from '@/lib/http-client'
import { useAuth } from '@/features/auth/auth-context'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'

import { MutedText, PageTitle, SectionTitle } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTasks } from '@/features/tasks/tasks-context'
import { LocationField } from '@/features/tasks/components/location-field'
import { uploadAgendaFiles } from './upload-agenda-files'
import type { Task } from '@/features/tasks/types/task'
import { TaskExecutionTime } from '@/features/tasks/components/task-execution-time'
import { LinkedText } from '@/components/linked-text'

type AgendaKind = 'event' | 'project' | 'task'
type AgendaItem = {
  id: string
  title: string
  type: Exclude<AgendaKind, 'task'>
  description: string | null
  startDate: string
  endDate: string
  location: string | null
  attachments: string[]
  icon: string | null
}
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
  const { tasks, completeTask, reopenTask, removeTask } = useTasks()
  const [items, setItems] = useState<AgendaItem[]>([])
  const [selectedDay, setSelectedDay] = useState(startOfDay(new Date()))
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sort, setSort] = useState<SortMode>('date')
  const [createOpen, setCreateOpen] = useState(false)
  const [details, setDetails] = useState<NormalAgendaItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    apiRequest<AgendaItem[]>('/agenda-items', { signal: controller.signal })
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
          startDate: task.dueDate,
          endDate: task.dueDate,
          icon: null,
          task,
        })),
        ...items,
      ].map(normalizeItem),
    [items, tasks],
  )

  const matchingItems = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR')
    if (!term) return []
    return allItems
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
  }, [allItems, query, sort])

  const dayItems = useMemo(
    () =>
      allItems
        .filter((item) =>
          overlapsDay(item.startDate, item.endDate, selectedDay),
        )
        .sort((a, b) => sortItems(a, b, 'date')),
    [allItems, selectedDay],
  )

  const unscheduledItems = allItems.filter((item) => !item.startDate)

  async function createItem(
    input: Omit<AgendaItem, 'id' | 'createdAt' | 'updatedAt'>,
  ) {
    const saved = await apiRequest<AgendaItem>('/agenda-items', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    setItems((current) => [...current, saved])
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

      {!searchOpen ? (
        <section
          aria-label="Semana"
          className="glass-panel grid gap-3 rounded-2xl border p-4 sm:p-5"
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
              const count = allItems.filter((item) =>
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

      {searchOpen && query.trim() ? (
        <section className="grid gap-3" aria-live="polite">
          <SectionTitle>
            Resultados da pesquisa ({matchingItems.length})
          </SectionTitle>
          {matchingItems.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {matchingItems.map((item) => (
                <AgendaCard
                  key={`${item.type}-${item.id}`}
                  item={item}
                  onSelect={() => setDetails(item)}
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
          {loading ? (
            <MutedText>Carregando agenda...</MutedText>
          ) : dayItems.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {dayItems.map((item) => (
                <AgendaCard
                  key={`${item.type}-${item.id}`}
                  item={item}
                  onSelect={() => setDetails(item)}
                />
              ))}
            </div>
          ) : (
            <Empty>Dia livre. Adicione um evento ou projeto à agenda.</Empty>
          )}
        </section>
      )}

      {!searchOpen && unscheduledItems.length ? (
        <section aria-label="Tarefas sem data" className="grid gap-3">
          <SectionTitle>Sem data</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {unscheduledItems.map((item) => (
              <AgendaCard
                key={`${item.type}-${item.id}`}
                item={item}
                onSelect={() => setDetails(item)}
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
        item={details}
        onClose={() => setDetails(null)}
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
          await apiRequest<void>(`/agenda-items/${item.id}`, {
            method: 'DELETE',
          })
          setItems((current) => current.filter((entry) => entry.id !== item.id))
          setDetails(null)
        }}
      />
    </div>
  )
}

function AgendaCard({
  item,
  onSelect,
}: {
  item: ReturnType<typeof normalizeItem>
  onSelect: () => void
}) {
  const task = item.type === 'task'
  const status = task && item.status ? taskStatusAppearance[item.status] : null
  return (
    <button
      className={cn(
        'glass-card grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-2xl border p-4 text-left transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        status?.card ?? 'bg-card/65 hover:border-primary/40',
      )}
      onClick={onSelect}
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
            <p className="truncate font-semibold" title={item.title}>
              {item.title}
            </p>
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

function AgendaDetails({
  item,
  onClose,
  onComplete,
  onReopen,
  onDelete,
}: {
  item: NormalAgendaItem | null
  onClose: () => void
  onComplete: (task: Task) => Promise<void>
  onReopen: (task: Task) => Promise<void>
  onDelete: (item: NormalAgendaItem) => Promise<void>
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [reopenError, setReopenError] = useState<string | null>(null)
  const task = item?.type === 'task' ? (item.task ?? null) : null
  const entity =
    item?.type === 'task'
      ? 'tarefa'
      : item?.type === 'event'
        ? 'evento'
        : 'projeto'
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg [overflow-wrap:anywhere]">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="leading-snug">
            {item?.title ?? 'Detalhes'}
          </DialogTitle>
          <DialogDescription>
            {item?.type === 'task'
              ? `Tarefa · ${item.category}`
              : item?.type === 'event'
                ? 'Evento'
                : 'Projeto'}
          </DialogDescription>
        </DialogHeader>
        {item ? (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-sm">
            {task ? (
              <>
                <AgendaTaskStatus status={task.status} />
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
            {item.startDate && item.endDate ? (
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/60 p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Início</p>
                  <p>
                    {formatDate(item.startDate)} · {formatTime(item.startDate)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Final</p>
                  <p>
                    {formatDate(item.endDate)} · {formatTime(item.endDate)}
                  </p>
                </div>
              </div>
            ) : (
              <MutedText>Sem data agendada.</MutedText>
            )}
            {item.location ? (
              <LocationPreview location={item.location} />
            ) : null}
            {item.attachments.length ? (
              <div>
                <p className="mb-1 font-medium">Documentos</p>
                <ul className="grid gap-1 text-primary">
                  {item.attachments.map((attachment) => {
                    const [name, url] = attachment.split('||')
                    return (
                      <li key={attachment}>
                        <a
                          className="underline"
                          href={url ? `${apiBase}${url}` : undefined}
                          rel="noreferrer"
                          target={url ? '_blank' : undefined}
                        >
                          {name}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
            {task?.permissions.changeStatus && task.status === 'completed' ? (
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
            {task?.permissions.changeStatus && task.status !== 'completed' ? (
              <Button
                onClick={() => {
                  onComplete(task).catch(() => undefined)
                }}
              >
                Concluir tarefa
              </Button>
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
            <DeleteConfirmationDialog
              open={confirmingDelete}
              onOpenChange={setConfirmingDelete}
              entity={entity}
              name={item.title}
              onConfirm={() => onDelete(item)}
            />
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
    input: Omit<AgendaItem, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<void>
}) {
  const { user } = useAuth()
  const [type, setType] = useState<'event' | 'project'>('event')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [location, setLocation] = useState('')
  const [icon, setIcon] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  function reset() {
    setTitle('')
    setDescription('')
    setStartDate('')
    setEndDate('')
    setLocation('')
    setIcon('')
    setFiles([])
    setError('')
  }
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
          className="grid min-h-0 gap-4 overflow-y-auto pr-1"
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
            setSaving(true)
            setError('')
            try {
              await onCreate({
                title: title.trim(),
                type,
                description: description.trim() || null,
                startDate: new Date(startDate).toISOString(),
                endDate: new Date(endDate).toISOString(),
                location: location || null,
                attachments: files,
                icon: icon || null,
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
                  setStartDate(event.target.value)
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
            <Input
              id="agenda-files"
              multiple
              type="file"
              onChange={async (event) => {
                const selected = Array.from(event.target.files ?? []).slice(
                  0,
                  10,
                )
                if (!selected.length) return
                setUploading(true)
                setError('')
                try {
                  const uploaded = await uploadAgendaFiles(selected, user!.id)
                  setFiles((current) =>
                    [
                      ...current,
                      ...uploaded.map((file) => `${file.name}||${file.url}`),
                    ].slice(0, 10),
                  )
                } catch (cause) {
                  setError(messageOf(cause))
                } finally {
                  setUploading(false)
                  event.target.value = ''
                }
              }}
            />
            <MutedText>
              {uploading
                ? 'Enviando documentos...'
                : files.length
                  ? files.map((file) => file.split('||')[0]).join(', ')
                  : 'Até 10 arquivos, máximo de 10 MB cada.'}
            </MutedText>
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
function startOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
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
function overlapsDay(start: string | null, end: string | null, day: Date) {
  if (!start || !end) return false
  const lower = startOfDay(day).getTime()
  const upper = lower + 86400000 - 1
  return new Date(start).getTime() <= upper && new Date(end).getTime() >= lower
}
function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(date))
}
function formatTime(date: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
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
function messageOf(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : 'Não foi possível completar a ação.'
}
