import { apiRequest } from '@/lib/http-client'

export type AgendaItem = {
  id: string
  title: string
  type: 'event' | 'project'
  description: string | null
  startDate: string
  endDate: string
  location: string | null
  attachments: string[]
  icon: string | null
}

export function listAgendaItems(signal: AbortSignal) {
  return apiRequest<AgendaItem[]>('/agenda-items', { signal })
}

export function removeAgendaItem(id: string) {
  return apiRequest<void>(`/agenda-items/${id}`, { method: 'DELETE' })
}

export function startOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function overlapsDay(
  start: string | null,
  end: string | null,
  day: Date,
) {
  if (!start || !end) return false
  const lower = startOfDay(day)
  const upper = new Date(lower)
  upper.setDate(upper.getDate() + 1)
  return new Date(start) < upper && new Date(end) >= lower
}
export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(date))
}
export function formatTime(date: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}
