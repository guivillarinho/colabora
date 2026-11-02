import type { FocusSession } from './types'

import { apiRequest as request } from '@/lib/http-client'

export const focusSessionsApi = {
  list: (signal?: AbortSignal) =>
    request<FocusSession[]>('/focus-sessions', { signal }),
  start: (title: string) =>
    request<FocusSession>('/focus-sessions', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  finish: (id: string) =>
    request<FocusSession>(`/focus-sessions/${id}/finish`, {
      method: 'POST',
    }),
}
