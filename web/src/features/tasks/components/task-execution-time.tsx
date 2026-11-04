import { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { formatDuration } from '@/lib/format-duration'
import type { Task } from '../types/task'

export function TaskExecutionTime({ task }: { task: Task }) {
  const [now, setNow] = useState(Date.now)
  const running = task.status === 'in_progress' && !!task.startedAt
  useEffect(() => {
    if (!running) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [running])

  const completed = task.status === 'completed'
  const estimated =
    completed &&
    (task.actualTimeSource === 'schedule' ||
      task.actualTimeSource === 'estimate')
  const minutes = completed
    ? task.actualTime
    : running
      ? Math.max(
          0,
          Math.floor((now - new Date(task.startedAt!).getTime()) / 60000),
        )
      : task.estimatedTime
  const label = completed
    ? estimated
      ? 'Tempo estimado de execução'
      : 'Tempo de execução'
    : running
      ? 'Tempo em execução'
      : 'Tempo previsto'
  const origin =
    completed && task.actualTimeSource === 'schedule'
      ? 'Desde o horário agendado'
      : completed && task.actualTimeSource === 'estimate'
        ? 'Duração prevista · sem início registrado'
        : null

  return (
    <div
      className="ml-auto grid min-w-0 gap-0.5 rounded-xl border border-primary/15 bg-primary/10 px-3 py-2 text-right text-primary"
      aria-label={label}
    >
      <span className="text-xs font-medium">{label}</span>
      <span className="inline-flex items-center justify-end gap-1.5 text-lg font-semibold tabular-nums">
        <Clock3 aria-hidden="true" className="size-4 shrink-0" />
        {minutes == null ? 'Não registrado' : formatDuration(minutes)}
      </span>
      {origin ? (
        <span className="text-xs text-muted-foreground">{origin}</span>
      ) : null}
    </div>
  )
}
