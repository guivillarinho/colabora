import type { Task } from './types/task'

export function isUtcMidnight(value: string | Date): boolean {
  const date = typeof value === 'string' ? new Date(value) : value
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  )
}

export function minutesBetween(
  start: string | Date,
  end: string | Date,
): number {
  const from = new Date(start).getTime()
  const to = new Date(end).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, Math.round((to - from) / 60000))
}

function sameLocalMinute(start: string, end: string): boolean {
  const left = new Date(start)
  const right = new Date(end)
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate() &&
    left.getHours() === right.getHours() &&
    left.getMinutes() === right.getMinutes()
  )
}

export function shownExecution(
  task: Task,
  now = Date.now(),
): { minutes: number | null; estimated: boolean; origin: string | null } {
  const completed = task.status === 'completed'
  const running = task.status === 'in_progress' && !!task.startedAt
  const dateOnly =
    completed &&
    task.actualTimeSource === 'schedule' &&
    !!task.dueDate &&
    isUtcMidnight(task.dueDate)
  const recordedStart = task.startedAt ?? task.dueDate
  const sameClock =
    completed &&
    task.actualTimeSource !== 'manual' &&
    !!recordedStart &&
    !!task.completedAt &&
    sameLocalMinute(recordedStart, task.completedAt)

  let minutes: number | null
  if (!completed) {
    minutes = running
      ? Math.max(
          0,
          Math.floor((now - new Date(task.startedAt!).getTime()) / 60000),
        )
      : task.estimatedTime
  } else if (task.actualTimeSource === 'manual') {
    minutes = task.actualTime
  } else if (sameClock && recordedStart && task.completedAt) {
    minutes = minutesBetween(recordedStart, task.completedAt)
  } else if (dateOnly) {
    minutes = task.estimatedTime
  } else if (
    task.actualTimeSource === 'timer' &&
    task.startedAt &&
    task.completedAt
  ) {
    minutes = minutesBetween(task.startedAt, task.completedAt)
  } else if (
    task.actualTimeSource === 'schedule' &&
    task.dueDate &&
    task.completedAt &&
    !isUtcMidnight(task.dueDate)
  ) {
    minutes = minutesBetween(task.dueDate, task.completedAt)
  } else {
    minutes = task.actualTime
  }

  const source = dateOnly ? 'estimate' : task.actualTimeSource
  const estimated =
    completed && (source === 'schedule' || source === 'estimate')
  const origin =
    completed && source === 'schedule'
      ? 'Desde o horário agendado'
      : completed && source === 'estimate'
        ? 'Duração prevista · sem início registrado'
        : null
  return { minutes, estimated, origin }
}
