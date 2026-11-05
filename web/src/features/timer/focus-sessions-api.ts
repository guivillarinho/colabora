import type { FocusSession } from './types'

import { apiRequest as request } from '@/lib/http-client'

export const focusSessionsApi = {
  list: (signal?: AbortSignal) =>
    request<FocusSession[]>('/focus-sessions', { signal }),
  start: (title: string, focusMinutes?: number, breakMinutes?: number) =>
    request<FocusSession>('/focus-sessions', {
      method: 'POST',
      body: JSON.stringify({ title, focusMinutes, breakMinutes }),
    }),
  finish: (id: string) =>
    request<FocusSession>(`/focus-sessions/${id}/finish`, {
      method: 'POST',
    }),
}
