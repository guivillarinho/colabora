import type { FocusSession } from './types'

declare const process: {
  env: {
    VITE_API_URL?: string
  }
}

const baseUrl = process.env.VITE_API_URL ?? 'http://localhost:3000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[]
    } | null
    const message = Array.isArray(body?.message)
      ? body.message.join(' ')
      : body?.message
    throw new Error(message || 'Não foi possível carregar as sessões de foco.')
  }

  return (await response.json()) as T
}

export const focusSessionsApi = {
  list: () => request<FocusSession[]>('/focus-sessions'),
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
