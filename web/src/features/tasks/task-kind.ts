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
  const timed = isTimedTask(task)
  const end = task.completedAt ?? null
  const start = timed ? task.startedAt : (task.dueDate ?? task.startedAt ?? end)
  if (end && (!start || new Date(start).getTime() > new Date(end).getTime()))
    return { startDate: end, endDate: end }
  return { startDate: start, endDate: end ?? (timed ? null : start) }
}
