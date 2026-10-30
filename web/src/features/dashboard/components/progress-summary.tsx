import { useEffect, useRef, useState } from 'react'

import { MutedText, SectionTitle } from '@/components/typography'
import { cn } from 'cn'

type ProgressSummaryProps = {
  total: number
  completed: number
}

const confettiColors = [
  'bg-pastel-red',
  'bg-pastel-blue',
  'bg-pastel-yellow',
  'bg-pastel-green',
  'bg-pastel-purple',
  'bg-pastel-orange',
]

export function ProgressSummary({ total, completed }: ProgressSummaryProps) {
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)
  const previousPercent = useRef(percent)
  const [celebrating, setCelebrating] = useState(false)
  const remaining = Math.max(0, total - completed)
  const progressColor =
    total === 0
      ? 'bg-muted-foreground'
      : percent === 100
        ? 'bg-pastel-green-foreground dark:bg-pastel-green-foreground'
        : percent < 34
          ? 'bg-pastel-red dark:bg-pastel-red-foreground'
          : 'bg-pastel-yellow dark:bg-pastel-yellow-foreground'

  useEffect(() => {
    if (percent === 100 && previousPercent.current < 100) {
      setCelebrating(true)
      const timeout = window.setTimeout(() => setCelebrating(false), 1600)
      previousPercent.current = percent
      return () => window.clearTimeout(timeout)
    }

    previousPercent.current = percent
  }, [percent])

  return (
    <section className="relative grid gap-3 overflow-hidden rounded-xl border bg-card p-4 text-card-foreground sm:p-5">
      {celebrating ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 overflow-hidden"
        >
          {Array.from({ length: 18 }, (_, index) => (
            <span
              key={index}
              className={cn(
                'absolute top-0 h-2.5 w-1.5 animate-colabora-confetti rounded-sm',
                confettiColors[index % confettiColors.length],
              )}
              style={{
                left: `${(index * 53) % 100}%`,
                animationDelay: `${(index % 6) * 45}ms`,
              }}
            />
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>Seu progresso</SectionTitle>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums',
            total === 0
              ? 'bg-muted text-muted-foreground'
              : percent === 100
                ? 'bg-pastel-green text-pastel-green-foreground'
                : percent < 34
                  ? 'bg-pastel-red text-pastel-red-foreground'
                  : 'bg-pastel-yellow text-pastel-yellow-foreground',
          )}
        >
          {percent}%
        </span>
      </div>
      <div
        aria-label="Progresso das tarefas"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="h-3 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width,background-color] duration-700 ease-out',
            progressColor,
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <MutedText>
          {total === 0
            ? 'Adicione uma tarefa para começar seu progresso.'
            : `${completed} de ${total} ${total === 1 ? 'tarefa concluída' : 'tarefas concluídas'}.`}
        </MutedText>
        {total > 0 ? (
          <MutedText>
            {remaining === 0
              ? 'Tudo concluído. Você mandou bem!'
              : `${remaining} ${remaining === 1 ? 'restante' : 'restantes'}`}
          </MutedText>
        ) : null}
      </div>
    </section>
  )
}
