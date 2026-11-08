import { MutedText, SectionTitle } from '@/components/typography'
import type { Task } from '@/features/tasks/types/task'

export function TaskExecutionChart({ tasks }: { tasks: Task[] }) {
  const totals = new Map<string, number>()
  for (const task of tasks) {
    if (task.status !== 'completed' || !task.actualTime || task.actualTime < 0)
      continue
    const category = task.category.trim() || 'Sem categoria'
    totals.set(category, (totals.get(category) ?? 0) + task.actualTime)
  }
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const total = rows.reduce((sum, [, minutes]) => sum + minutes, 0)
  const maximum = rows[0]?.[1] ?? 1

  return (
    <section
      className="surface-panel grid min-w-0 gap-4 rounded-2xl border p-5"
      aria-label="Tempo de execução das tarefas"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <SectionTitle>Tempo por categoria</SectionTitle>
          <MutedText>Tarefas concluídas · todo o período</MutedText>
        </div>
        <p className="text-xl font-semibold tabular-nums">
          {formatDuration(total)}
        </p>
      </div>
      {rows.length ? (
        <ul aria-label="Tempo registrado por categoria" className="grid gap-4">
          {rows.map(([category, minutes]) => (
            <li key={category} className="grid min-w-0 gap-1.5">
              <div className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">{category}</span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatDuration(minutes)}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="h-3 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(minutes / maximum) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <MutedText>
          Conclua tarefas com tempo registrado para visualizar o gráfico.
        </MutedText>
      )}
      {rows.length > 0 ? (
        <MutedText>
          Inclui os tempos registrados, informados ou estimados nas tarefas
          concluídas.
        </MutedText>
      ) : null}
    </section>
  )
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours} h${rest ? ` ${rest} min` : ''}` : `${rest} min`
}
