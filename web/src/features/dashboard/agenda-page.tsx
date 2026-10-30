import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
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
import type { Task } from '@/features/tasks/types/task'

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
type SortMode = 'date' | 'name' | 'type'

declare const process: { env: { VITE_API_URL?: string } }
const apiBase = process.env.VITE_API_URL ?? 'http://localhost:3000'
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
  const { tasks, completeTask } = useTasks()
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
    fetch(`${apiBase}/agenda-items`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível carregar a agenda.')
        return (await response.json()) as AgendaItem[]
      })
      .then(setItems)
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setLoading(false))
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
        ...tasks
          .filter((task) => task.dueDate)
          .map((task) => ({
            ...task,
            type: 'task' as const,
            startDate: task.dueDate as string,
            endDate: task.dueDate as string,
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
        .sort(
          (a, b) =>
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
        ),
    [allItems, selectedDay],
  )

  async function createItem(
    input: Omit<AgendaItem, 'id' | 'createdAt' | 'updatedAt'>,
  ) {
    const response = await fetch(`${apiBase}/agenda-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        message?: string
      }
      throw new Error(body.message ?? 'Não foi possível salvar o item.')
    }
    const saved = (await response.json()) as AgendaItem
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
          className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5"
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

      <AgendaCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={createItem}
      />
      <AgendaDetails
        item={details}
        onClose={() => setDetails(null)}
        onComplete={async (task) => {
          await completeTask(task.id)
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
  return (
    <button
      className="grid min-w-0 gap-2 rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
            {task ? (
              <CalendarDays className="size-4" />
            ) : (
              item.icon || <FolderKanban className="size-4" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{item.title}</p>
            <p className="text-xs capitalize text-muted-foreground">
              {task
                ? `Tarefa · ${item.category}`
                : item.type === 'event'
                  ? 'Evento'
                  : 'Projeto'}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">
          {formatTime(item.startDate)}
        </span>
      </div>
      {item.description ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {item.description}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {formatDate(item.startDate)}
          {!sameCalendarDate(item.startDate, item.endDate)
            ? ` – ${formatDate(item.endDate)}`
            : ''}
        </span>
        {item.location ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {item.location}
          </span>
        ) : null}
        {item.attachments.length ? (
          <span>{item.attachments.length} anexo(s)</span>
        ) : null}
      </div>
    </button>
  )
}

function AgendaDetails({
  item,
  onClose,
  onComplete,
}: {
  item: NormalAgendaItem | null
  onClose: () => void
  onComplete: (task: Task) => Promise<void>
}) {
  const task = item?.type === 'task' ? (item.task ?? null) : null
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item?.title ?? 'Detalhes'}</DialogTitle>
          <DialogDescription>
            {item?.type === 'task'
              ? `Tarefa · ${item.category}`
              : item?.type === 'event'
                ? 'Evento'
                : 'Projeto'}
          </DialogDescription>
        </DialogHeader>
        {item ? (
          <div className="grid gap-4 text-sm">
            <p className="whitespace-pre-wrap text-muted-foreground">
              {item.description || 'Sem descrição.'}
            </p>
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
            {task && task.status !== 'completed' ? (
              <Button onClick={() => void onComplete(task)}>
                Concluir tarefa
              </Button>
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
    input: Omit<AgendaItem, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<void>
}) {
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
                const formData = new FormData()
                selected.forEach((file) => formData.append('files', file))
                setUploading(true)
                setError('')
                try {
                  const response = await fetch(
                    `${apiBase}/agenda-items/uploads`,
                    { method: 'POST', body: formData },
                  )
                  if (!response.ok)
                    throw new Error(
                      'Não foi possível enviar os documentos. Limite: 10 MB por arquivo.',
                    )
                  const uploaded = (await response.json()) as Array<{
                    name: string
                    url: string
                  }>
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

type NormalAgendaItem = Omit<AgendaItem, 'type'> & {
  type: AgendaKind
  category?: string
  status?: Task['status']
  task?: Task
}
function normalizeItem(
  item:
    | AgendaItem
    | (Task & {
        type: 'task'
        startDate: string
        endDate: string
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
function overlapsDay(start: string, end: string, day: Date) {
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
