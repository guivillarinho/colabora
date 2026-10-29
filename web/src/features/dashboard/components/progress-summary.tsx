import { MutedText, SectionTitle } from '@/components/typography'

type ProgressSummaryProps = {
  total: number
  completed: number
}

export function ProgressSummary({ total, completed }: ProgressSummaryProps) {
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 text-card-foreground">
      <SectionTitle>Progresso</SectionTitle>
      <div
        aria-label="Progresso do dia"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <MutedText>
        {total === 0
          ? 'Nenhuma tarefa ainda. Use Criar tarefa para começar.'
          : `${completed} de ${total} tarefas concluídas.`}
      </MutedText>
    </section>
  )
}
