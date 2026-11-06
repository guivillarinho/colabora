import type { Task } from './types/task'

export function isTimedTask(task: {
  timed?: boolean
  dueDate: string | null
  startedAt: string | null
  actualTimeSource?: Task['actualTimeSource']
}): boolean {
  if (task.timed === true) return true
  if (task.timed === false) return false
  if (task.dueDate) return false
  return Boolean(task.startedAt) || task.actualTimeSource === 'timer'
}

export function taskWindow(task: {
  timed?: boolean
  dueDate: string | null
  startedAt: string | null
  completedAt?: string | null
  actualTimeSource?: Task['actualTimeSource']
}): { startDate: string | null; endDate: string | null } {
  if (isTimedTask(task))
    return { startDate: task.startedAt, endDate: task.completedAt ?? null }
  return {
    startDate: task.dueDate,
    endDate: task.completedAt ?? task.dueDate,
  }
}
