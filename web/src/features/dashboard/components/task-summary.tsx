import type { ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import { cn } from 'cn'
import { pastelSwatches } from '@/components/pastel'
import { MutedText } from '@/components/typography'
import { LinkedText } from '@/components/linked-text'
import { formatDuration } from '@/lib/format-duration'
import { TaskAssigneeBadge } from '@/features/tasks/components/task-assignee-badge'
import { TaskAttachmentIndicator } from '@/features/tasks/components/task-attachment-indicator'
import type { Task } from '@/features/tasks/types/task'

export const taskSummaryClassName =
  'surface-card colabora-timeline-card relative z-10 grid min-w-0 cursor-pointer select-none grid-cols-[minmax(0,1fr)] gap-2 overflow-hidden rounded-xl border p-3 [overflow-wrap:anywhere] sm:p-4'

export function TaskSummary({
  task,
  children,
  footer,
  linkDescription = true,
}: {
  task: Task
  children?: ReactNode
  linkDescription?: boolean
  footer?: ReactNode
}) {
  const swatch =
    pastelSwatches.find((item) => item.id === task.color) ?? pastelSwatches[1]
  const description = task.description?.trim()
  const schedule = task.dueDate ?? task.startedAt
  const date = schedule ? new Date(schedule) : null
  const dateLabel = date
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date)
    : 'Sem data'
  const timeLabel = date
    ? new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
    : 'Sem horário'
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <MutedText>{dateLabel}</MutedText>
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-lg bg-muted px-2.5 py-1.5 text-sm font-semibold tabular-nums text-foreground">
            {timeLabel}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="line-clamp-1 min-w-0 font-semibold leading-snug">
          {task.title}
        </h3>
        <TaskAttachmentIndicator count={task.attachments.length} />
      </div>
      <TaskAssigneeBadge task={task} />
      <div>
        {children}
        {description ? (
          <p className="line-clamp-3 whitespace-pre-line text-sm leading-5 text-muted-foreground">
            {linkDescription ? (
              <LinkedText>{description}</LinkedText>
            ) : (
              description
            )}
          </p>
        ) : (
          <MutedText>Sem descrição</MutedText>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'min-w-0 max-w-full truncate rounded-full px-2.5 py-1 text-xs font-medium',
            swatch.className,
          )}
        >
          {task.category}
        </span>
        {footer ?? (
          <span className="text-xs text-muted-foreground">
            {formatDuration(task.estimatedTime)} estimados
          </span>
        )}
      </div>
      {task.location?.trim() ? (
        <p className="mt-1 flex items-start gap-1 text-xs leading-relaxed text-muted-foreground">
          <MapPin aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
          <span className="line-clamp-1 min-w-0">{task.location}</span>
        </p>
      ) : null}
    </>
  )
}
