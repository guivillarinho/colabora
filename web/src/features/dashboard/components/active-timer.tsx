import { useEffect, useState } from 'react'
import { CheckIcon, TimerIcon } from 'lucide-react'

import { pastelSwatches } from '@/components/pastel'
import { Button } from '@/components/ui/button'
import { cn } from 'cn'
import type { Task } from '@/features/tasks/types/task'

type ActiveTimerProps = {
  tasks: Task[]
  onComplete: (taskId: string) => Promise<void>
}

export function ActiveTimer({ tasks, onComplete }: ActiveTimerProps) {
  const activeTasks = tasks.filter(
    (task) => task.status === 'in_progress' && task.startedAt,
  )

  if (activeTasks.length === 0) {
    return null
  }

  return (
    <section aria-labelledby="active-timer-title" className="grid gap-3">
      <h2
        className="flex items-center gap-2 text-lg font-semibold"
        id="active-timer-title"
      >
        <TimerIcon
          aria-hidden="true"
          className="size-5 text-pastel-green-foreground"
        />
        Timer ativo
      </h2>
      <div className="grid gap-3">
        {activeTasks.map((task) => (
          <ActiveTimerCard
            key={task.id}
            task={task}
            onComplete={() => onComplete(task.id)}
          />
        ))}
      </div>
    </section>
  )
}

type ActiveTimerCardProps = {
  task: Task
  onComplete: () => Promise<void>
}

function ActiveTimerCard({ task, onComplete }: ActiveTimerCardProps) {
  const [now, setNow] = useState(Date.now)
  const [completing, setCompleting] = useState(false)
  const swatch =
    pastelSwatches.find((item) => item.id === task.color) ?? pastelSwatches[1]
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - new Date(task.startedAt ?? now).getTime()) / 1000),
  )

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  async function handleComplete() {
    setCompleting(true)
    try {
      await onComplete()
    } catch {
      // The task context exposes the API error in the app shell.
    } finally {
      setCompleting(false)
    }
  }

  return (
    <article className="grid gap-3 rounded-xl border border-pastel-green bg-pastel-green/30 p-4 sm:flex sm:items-center sm:justify-between">
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-pastel-green-foreground opacity-50" />
            <span className="relative inline-flex size-2.5 rounded-full bg-pastel-green-foreground" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-pastel-green-foreground">
            Contando agora
          </span>
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium',
              swatch.className,
            )}
          >
            {task.category}
          </span>
        </div>
        <h3 className="truncate font-semibold" title={task.title}>
          {task.title}
        </h3>
        <p
          aria-label={`Tempo decorrido: ${formatElapsed(elapsedSeconds)}`}
          className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-pastel-green-foreground sm:text-3xl"
          role="timer"
        >
          {formatElapsed(elapsedSeconds)}
        </p>
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={completing}
        type="button"
        onClick={handleComplete}
      >
        <CheckIcon aria-hidden="true" />
        {completing ? 'Concluindo...' : 'Concluir tarefa'}
      </Button>
    </article>
  )
}

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}
