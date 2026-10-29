import { formatDueDate } from '@/lib/format-duration'
import { cn } from 'cn'
import { pastelSwatches } from '@/components/pastel'
import { MutedText, SectionTitle } from '@/components/typography'
import { sortTasks } from '@/features/tasks/sort-tasks'
import type { Task } from '@/features/tasks/types/task'

type TaskTimelineProps = {
  tasks: Task[]
}

export function TaskTimeline({ tasks }: TaskTimelineProps) {
  const ordered = sortTasks(tasks, 'dueDate')

  return (
    <section className="grid gap-4">
      <SectionTitle>Linha do tempo</SectionTitle>
      {ordered.length === 0 ? (
        <MutedText>
          Nada agendado. As tarefas com data e hora aparecem aqui.
        </MutedText>
      ) : (
        <ol className="grid gap-4 border-l border-border pl-5">
          {ordered.map((task) => {
            const swatch =
              pastelSwatches.find((item) => item.id === task.color) ??
              pastelSwatches[1]

            return (
              <li key={task.id} className="relative grid gap-1">
                <span
                  className={cn(
                    'absolute -left-[1.55rem] top-1 size-3 rounded-full ring-2 ring-background',
                    swatch.className,
                  )}
                />
                <MutedText>{formatDueDate(task.dueDate)}</MutedText>
                <p className="font-medium">{task.title}</p>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
