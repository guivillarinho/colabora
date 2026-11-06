import type { ActualTimeSource } from './entities/task.entity'

export function isUtcMidnight(date: Date): boolean {
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  )
}

export function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
}

/**
 * A due date saved at 00:00 UTC is a calendar date, not a start clock.
 * Measuring from that instant until 17:55 in Brasília (20:55 UTC) reports
 * 20 h 55 min for a task the user finished at the scheduled hour.
 */
export function resolveExecution(
  task: {
    startedAt: Date | null
    dueDate: Date | null
    estimatedTime: number
  },
  actualTime: number | undefined,
  now: Date,
): { actualTime: number; actualTimeSource: ActualTimeSource } {
  if (actualTime !== undefined)
    return { actualTime, actualTimeSource: 'manual' }
  if (task.startedAt)
    return {
      actualTime: minutesBetween(task.startedAt, now),
      actualTimeSource: 'timer',
    }
  if (task.dueDate && task.dueDate.getTime() <= now.getTime()) {
    if (isUtcMidnight(task.dueDate))
      return { actualTime: task.estimatedTime, actualTimeSource: 'estimate' }
    return {
      actualTime: minutesBetween(task.dueDate, now),
      actualTimeSource: 'schedule',
    }
  }
  return { actualTime: task.estimatedTime, actualTimeSource: 'estimate' }
}
