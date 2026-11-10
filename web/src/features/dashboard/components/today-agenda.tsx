import { useEffect, useRef, useState } from 'react'
import { CalendarDays, FolderKanban } from 'lucide-react'

import { MutedText, SectionTitle } from '@/components/typography'
import { Button } from '@/components/ui/button'

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

export function TodayAgenda({ onViewAll }: { onViewAll: () => void }) {
  const [items, setItems] = useState<AgendaItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [details, setDetails] = useState<AgendaItem | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    listAgendaItems(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setItems(data)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [])

  const today = startOfDay(new Date())
  const todayItems = items
    ?.filter((item) => overlapsDay(item.startDate, item.endDate, today))
    .slice(0, previewLimit)

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
      {todayItems?.length ? (
        <ul className="grid min-w-0 gap-2">
          {todayItems.map((item) => {
            const isProject = item.type === 'project'
            const Icon = isProject ? FolderKanban : CalendarDays
            const when =
              new Date(item.startDate) < today
                ? `Desde ${formatDate(item.startDate)}`
                : formatTime(item.startDate)

            return (
              <li key={item.id} className="min-w-0">
                <button
                  type="button"
                  className="surface-card flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 text-left hover:bg-accent"
                  onClick={(event) => {
                    trigger.current = event.currentTarget
                    setDetails(item)
                  }}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium wrap-anywhere">
                      {item.title}
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
          })}
        </ul>
      ) : (
        <div role="status">
          <MutedText>
            {failed
              ? 'Não foi possível carregar os eventos e projetos.'
              : items
                ? 'Nenhum evento ou projeto agendado para hoje.'
                : 'Carregando eventos e projetos...'}
          </MutedText>
        </div>
      )}
      {details ? (
        <AgendaDetails
          item={details}
          onClose={() => setDetails(null)}
          returnFocus={() => trigger.current?.focus()}
          onDelete={async ({ id }) => {
            await removeAgendaItem(id)
            setItems(
              (current) => current?.filter((item) => item.id !== id) ?? null,
            )
            setDetails(null)
          }}
        />
      ) : null}
    </section>
  )
}
