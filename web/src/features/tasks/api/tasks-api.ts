import type { Task, TaskCompletion, TaskInput } from '../types/task'

import { apiRequest as request } from '@/lib/http-client'

export const tasksApi = {
  list: (signal?: AbortSignal) => request<Task[]>('/tasks', { signal }),
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
  respondAssignment: (id: string, response: 'accepted' | 'declined') =>
    request<Task>(`/tasks/${id}/assignment`, {
      method: 'PATCH',
      body: JSON.stringify({ response }),
    }),
  remove: (id: string) =>
    request<void>(`/tasks/${id}`, {
      method: 'DELETE',
    }),
  start: (id: string) =>
    request<Task>(`/tasks/${id}/start`, {
      method: 'POST',
    }),
  reopen: (id: string) =>
    request<Task>(`/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'pending' }),
    }),
  complete: (id: string, actualTime?: number) =>
    request<TaskCompletion>(`/tasks/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify(actualTime === undefined ? {} : { actualTime }),
    }),
}
