import type { Task, TaskCompletion, TaskInput } from '../types/task'

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

  if (response.status === 204) {
    return undefined as T
  }

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  return (await response.json()) as T
}

async function readError(response: Response): Promise<string> {
  const text = await response.text()

  try {
    const body = JSON.parse(text) as { message?: string | string[] }

    if (Array.isArray(body.message)) {
      return body.message.join(' ')
    }

    if (body.message) {
      return body.message
    }
  } catch {
    return text || 'Não foi possível falar com a API.'
  }

  return text || 'Não foi possível falar com a API.'
}

export const tasksApi = {
  list: () => request<Task[]>('/tasks'),
  create: (input: TaskInput) =>
    request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: string, input: TaskInput) =>
    request<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    request<void>(`/tasks/${id}`, {
      method: 'DELETE',
    }),
  start: (id: string) =>
    request<Task>(`/tasks/${id}/start`, {
      method: 'POST',
    }),
  complete: (id: string, actualTime?: number) =>
    request<TaskCompletion>(`/tasks/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify(actualTime === undefined ? {} : { actualTime }),
    }),
}
