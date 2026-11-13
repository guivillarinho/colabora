import { useEffect, useRef, useState } from 'react'
import { CalendarDays, FolderKanban } from 'lucide-react'

import { MutedText, SectionTitle } from '@/components/typography'
import { Button } from '@/components/ui/button'
import {
  SelectionCircle,
  useCardHold,
  type CardSelection,
} from './card-selection'
import { hapticFeedback } from '@/lib/haptics'
import { AgendaCardSkeleton } from './agenda-card-skeleton'

import { AgendaDetails } from '../agenda-page'
import {
  formatDate,
  formatTime,
  listAgendaItems,
  overlapsDay,
  removeAgendaItem,
  startOfDay,
  type AgendaItem,
} from '../agenda-items'

const previewLimit = 3
function EventSkeletons() {
  return (
    <div
      aria-label="Carregando eventos e projetos"
      role="status"
      className="w-full min-w-0"
    >
      <ul
        aria-hidden="true"
        className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-3"
      >
        {Array.from({ length: 3 }, (_, index) => (
          <li key={index} className="w-full min-w-0">
            <AgendaCardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function useTodayAgenda() {
  const [items, setItems] = useState<AgendaItem[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const load = () => {
      listAgendaItems(controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setItems(data)
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true)
        })
    }
    load()
    window.addEventListener('colabora-google-synced', load)
    return () => {
      controller.abort()
      window.removeEventListener('colabora-google-synced', load)
    }
  }, [])

  const today = startOfDay(new Date())
  const todayItems = items
    ?.filter((item) => overlapsDay(item.startDate, item.endDate, today))
    .slice(0, previewLimit)

  return {
    todayItems,
    failed,
    updateItem: (saved: AgendaItem) => {
      setItems(
        (current) =>
          current?.map((item) => (item.id === saved.id ? saved : item)) ?? null,
      )
    },
    removeItem: async (id: string) => {
      await removeAgendaItem(id)
      setItems((current) => current?.filter((item) => item.id !== id) ?? null)
    },
  }
}

export function TodayAgenda({
  onViewAll,
  todayItems,
  failed,
  removeItem,
  updateItem,
  selection,
  onHold,
}: ReturnType<typeof useTodayAgenda> & {
  onViewAll: () => void
  selection?: CardSelection
  onHold: (key: string) => void
}) {
  const [details, setDetails] = useState<AgendaItem | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  return (
    <section
      aria-label="Eventos e projetos de hoje"
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
    >
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>Eventos e projetos de hoje</SectionTitle>
        {todayItems?.length ? (
          <Button
            className="h-8 rounded-full bg-transparent px-4 text-pastel-green-foreground shadow-none hover:bg-transparent hover:text-pastel-green-foreground hover:underline"
            size="sm"
            type="button"
            variant="ghost"
            aria-label="Ver tudo na agenda de hoje"
            onClick={onViewAll}
          >
            Ver tudo
          </Button>
        ) : null}
      </div>
      {todayItems === undefined ? (
        failed ? (
          <div role="status">
            <MutedText>
              Não foi possível carregar os eventos e projetos.
            </MutedText>
          </div>
        ) : (
          <EventSkeletons />
        )
      ) : todayItems.length ? (
        <ul className="grid min-w-0 gap-2">
          {todayItems.map((item) => (
            <TodayAgendaCard
              key={item.id}
              item={item}
              selection={selection}
              onHold={onHold}
              onOpen={(button) => {
                trigger.current = button
                setDetails(item)
              }}
            />
          ))}
        </ul>
      ) : (
        <div role="status">
          <MutedText>Nenhum evento ou projeto agendado para hoje.</MutedText>
        </div>
      )}
      {details ? (
        <AgendaDetails
          item={details}
          onClose={() => setDetails(null)}
          onAttachmentSaved={(saved) => {
            updateItem(saved)
            setDetails((current) =>
              current?.id === saved.id ? saved : current,
            )
          }}
          returnFocus={() => trigger.current?.focus()}
          onDelete={async ({ id }) => {
            await removeItem(id)
            setDetails(null)
          }}
        />
      ) : null}
    </section>
  )
}

function TodayAgendaCard({
  item,
  selection,
  onHold,
  onOpen,
}: {
  item: AgendaItem
  selection?: CardSelection
  onHold: (key: string) => void
  onOpen: (button: HTMLButtonElement) => void
}) {
  const hold = useCardHold()
  const origin = useRef({ x: 0, y: 0 })
  const key = `${item.type}-${item.id}`
  const selected = selection?.selected.has(key) ?? false
  const isProject = item.type === 'project'
  const Icon = isProject ? FolderKanban : CalendarDays
  const when =
    new Date(item.startDate) < startOfDay(new Date())
      ? `Desde ${formatDate(item.startDate)}`
      : formatTime(item.startDate)

  function selectOnHold() {
    onHold(key)
    hapticFeedback('threshold')
  }

  return (
    <li className="min-w-0">
      <button
        type="button"
        role={selection ? 'checkbox' : undefined}
        aria-checked={selection ? selected : undefined}
        className="surface-card grid min-h-44 w-full min-w-0 cursor-pointer touch-pan-y select-none grid-cols-[auto_minmax(0,1fr)_auto] content-start items-start gap-3 rounded-2xl border bg-card p-4 text-left hover:bg-accent [-webkit-touch-callout:none]"
        onPointerDown={(event) => {
          if (event.button !== 0 || event.isPrimary === false) return
          origin.current = { x: event.clientX, y: event.clientY }
          hold.start(selectOnHold)
        }}
        onPointerMove={(event) => {
          if (
            Math.hypot(
              event.clientX - origin.current.x,
              event.clientY - origin.current.y,
            ) > 10
          )
            hold.cancel()
        }}
        onPointerUp={hold.cancel}
        onPointerCancel={hold.cancel}
        onPointerLeave={hold.cancel}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') selection?.cancel()
          if (!selection && event.shiftKey && event.key === ' ') {
            event.preventDefault()
            selectOnHold()
          }
        }}
        onClick={(event) => {
          if (hold.consume() && event.detail !== 0) return
          if (selection) selection.toggle(key)
          else onOpen(event.currentTarget)
        }}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium wrap-anywhere">
            {selection ? <SelectionCircle checked={selected} /> : null}
            <span className="min-w-0">{item.title}</span>
          </span>
          <span className="block text-sm text-muted-foreground">
            {isProject ? 'Projeto' : 'Evento'}
          </span>
        </span>
        <time
          dateTime={item.startDate}
          className="shrink-0 text-xs text-muted-foreground"
        >
          {when}
        </time>
      </button>
    </li>
  )
}
