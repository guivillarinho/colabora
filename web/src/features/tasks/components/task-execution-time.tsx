import { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { formatDuration } from '@/lib/format-duration'
import { shownExecution } from '../execution-minutes'
import type { Task } from '../types/task'

export function TaskExecutionTime({
  task,
  compact = false,
}: {
  task: Task
  compact?: boolean
}) {
  const [now, setNow] = useState(Date.now)
  const running = task.status === 'in_progress' && !!task.startedAt
  useEffect(() => {
    if (!running) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [running])

  const completed = task.status === 'completed'
  const execution = shownExecution(task, now)
  const { minutes, estimated, origin } = execution
  const label = completed
    ? estimated
      ? 'Tempo estimado de execução'
      : 'Tempo de execução'
    : running
      ? 'Tempo em execução'
      : 'Tempo previsto'

  if (compact) {
    const duration =
      minutes == null
        ? 'não registrado'
        : formatDuration(minutes).replace(' h', 'h').replace(' min', 'min')
    return (
      <span className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-lg border border-primary/15 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
        <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
        Concluído em: {duration}
      </span>
    )
  }

  return (
    <section
      className="grid min-w-0 gap-1 rounded-xl border border-primary/15 bg-primary/10 p-3 text-primary"
      aria-label={label}
    >
      <span className="text-xs font-medium">{label}</span>
      <span className="inline-flex items-center gap-1.5 text-base font-semibold tabular-nums">
        <Clock3 aria-hidden="true" className="size-4 shrink-0" />
        {minutes == null ? 'Não registrado' : formatDuration(minutes)}
      </span>
      {origin ? (
        <span className="text-xs text-muted-foreground">{origin}</span>
      ) : null}
    </section>
  )
}
