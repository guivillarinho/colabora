import { apiRequest } from '@/lib/http-client'
import type { TaskColor } from './types/task'

export type ApiTaskCategory = {
  id: string
  name: string
  color: TaskColor
  googleListId: string | null
  syncState: 'synced' | 'pending' | 'error' | 'conflict'
}

export function fetchTaskCategories() {
  return apiRequest<ApiTaskCategory[]>('/task-categories')
}

export function createTaskCategory(input: { name: string; color: TaskColor }) {
  return apiRequest<ApiTaskCategory>('/task-categories', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
