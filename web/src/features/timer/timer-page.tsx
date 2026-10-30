import { useEffect, useMemo, useState } from 'react'
import { Check, Clock3, History, Play, Timer, TimerReset } from 'lucide-react'

import { MutedText, PageTitle, SectionTitle } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { focusSessionsApi } from './focus-sessions-api'
import type { FocusSession } from './types'

const recentSessionLimit = 5

export function TimerPage() {
  const [sessions, setSessions] = useState<FocusSession[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [showAllSessions, setShowAllSessions] = useState(false)

  useEffect(() => {
    let mounted = true

    focusSessionsApi
      .list()
      .then((data) => {
        if (mounted) {
          setSessions(data)
        }
      })
      .catch((cause: unknown) => {
        if (mounted) {
          setError(errorMessage(cause))
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  const activeSession = sessions.find((session) => session.endedAt === null)
  const completedSessions = sessions.filter((session) => session.endedAt)
  const stats = useMemo(() => calculateStats(sessions, now), [sessions, now])

  useEffect(() => {
    if (!activeSession) {
      return
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [activeSession?.id])

  async function handleStart(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const session = await focusSessionsApi.start(title.trim())
      setSessions((current) => [session, ...current])
      setTitle('')
      setNow(Date.now())
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  async function handleFinish() {
    if (!activeSession) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      const finished = await focusSessionsApi.finish(activeSession.id)
      setSessions((current) =>
        current.map((session) =>
          session.id === finished.id ? finished : session,
        ),
      )
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  const visibleSessions = showAllSessions
    ? completedSessions
    : completedSessions.slice(0, recentSessionLimit)
  const hiddenSessions = completedSessions.length - visibleSessions.length

  return (
    <div className="grid gap-6 sm:gap-8">
      <div className="grid gap-1">
        <PageTitle>Timer</PageTitle>
        <MutedText>Inicie uma sessão e acompanhe seu tempo de foco.</MutedText>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 sm:gap-8 sm:contents">
        <section aria-label="Sessão de foco" className="order-1 grid gap-3">
          <SectionTitle>Seu foco agora</SectionTitle>
          <article className="grid justify-items-center gap-5 rounded-2xl border bg-card p-5 text-center shadow-sm sm:p-8">
            {activeSession ? (
              <>
                <div className="grid gap-1">
                  <p className="inline-flex items-center justify-center gap-2 text-sm font-medium text-primary">
                    <span className="relative flex size-2.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                    </span>
                    Sessão em andamento
                  </p>
                  <h2 className="max-w-full break-words text-lg font-semibold sm:text-xl">
                    {activeSession.title}
                  </h2>
                </div>
                <TimerFace
                  seconds={elapsedSeconds(activeSession.startedAt, now)}
                />
                <Button
                  className="w-full sm:w-auto"
                  disabled={saving}
                  type="button"
                  variant="destructive"
                  onClick={handleFinish}
                >
                  <TimerReset aria-hidden="true" />
                  {saving ? 'Encerrando...' : 'Encerrar sessão'}
                </Button>
              </>
            ) : (
              <>
                <div className="grid justify-items-center gap-2">
                  <span className="grid size-12 place-items-center rounded-full bg-secondary text-primary">
                    <Timer aria-hidden="true" className="size-6" />
                  </span>
                  <h2 className="text-lg font-semibold sm:text-xl">
                    Pronto para focar?
                  </h2>
                  <MutedText>Escolha um nome e comece quando quiser.</MutedText>
                </div>
                <form
                  className="grid w-full max-w-md gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                  onSubmit={handleStart}
                >
                  <div className="grid gap-2 text-left">
                    <Label htmlFor="focus-session-title">No que vai focar?</Label>
                    <Input
                      autoComplete="off"
                      id="focus-session-title"
                      maxLength={120}
                      placeholder="Ex.: estudar, escrever, planejar"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full sm:w-auto"
                    disabled={saving}
                    type="submit"
                  >
                    <Play aria-hidden="true" />
                    {saving ? 'Iniciando...' : 'Iniciar sessão'}
                  </Button>
                </form>
              </>
            )}
          </article>
        </section>

        <section
          aria-label="Resumo do foco"
          className="order-2 grid gap-3 sm:grid-cols-3"
        >
        <StatCard
          icon={<Check aria-hidden="true" className="size-4" />}
          label="Sessões de hoje"
          value={String(stats.sessionsToday)}
        />
        <StatCard
          icon={<Clock3 aria-hidden="true" className="size-4" />}
          label="Foco hoje"
          value={formatMinutes(stats.todayMinutes)}
        />
        <StatCard
          icon={<Timer aria-hidden="true" className="size-4" />}
          label="Tempo total"
          value={formatMinutes(stats.totalMinutes)}
        />
        </section>
      </div>

      <section aria-labelledby="focus-history-title" className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle>
            <span
              className="inline-flex items-center gap-2"
              id="focus-history-title"
            >
              <History aria-hidden="true" className="size-4 text-primary" />
              Sessões recentes
            </span>
          </SectionTitle>
          {loading ? (
            <MutedText>Carregando...</MutedText>
          ) : completedSessions.length > 0 ? (
            <MutedText>{completedSessions.length} no total</MutedText>
          ) : null}
        </div>
        {loading ? (
          <MutedText>Carregando sessões de foco...</MutedText>
        ) : completedSessions.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card px-4 py-8 text-center">
            <MutedText>Suas sessões concluídas aparecerão aqui.</MutedText>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {visibleSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </ul>
        )}
        {hiddenSessions > 0 ? (
          <Button
            className="w-full text-primary hover:text-primary sm:w-auto"
            type="button"
            variant="ghost"
            onClick={() => setShowAllSessions(true)}
          >
            Ver mais sessões ({hiddenSessions})
          </Button>
        ) : null}
      </section>
    </div>
  )
}

type StatCardProps = {
  icon: React.ReactNode
  label: string
  value: string
}

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <article className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <p className="text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </article>
  )
}

function TimerFace({ seconds }: { seconds: number }) {
  return (
    <div className="grid size-52 place-items-center rounded-full border-[10px] border-primary/15 bg-secondary/50 sm:size-60">
      <p
        aria-label={`Tempo de foco: ${formatElapsed(seconds)}`}
        className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-primary sm:text-5xl"
        role="timer"
      >
        {formatElapsed(seconds)}
      </p>
    </div>
  )
}

function SessionCard({ session }: { session: FocusSession }) {
  const duration = elapsedSeconds(
    session.startedAt,
    Date.parse(session.endedAt!),
  )
  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(session.startedAt))

  return (
    <li>
      <article className="grid min-w-0 gap-2 rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="truncate font-medium" title={session.title}>
          {session.title}
        </h3>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
        <p className="font-mono text-lg font-semibold tabular-nums text-primary">
          {formatElapsed(duration)}
        </p>
      </article>
    </li>
  )
}

function calculateStats(sessions: FocusSession[], now: number) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const todayStart = today.getTime()
  const todayEnd = now
  let todaySeconds = 0
  let sessionsToday = 0
  let totalSeconds = 0

  for (const session of sessions) {
    const started = Date.parse(session.startedAt)
    const ended = session.endedAt ? Date.parse(session.endedAt) : now
    const duration = elapsedSeconds(session.startedAt, ended)
    totalSeconds += duration

    if (started >= todayStart || (!session.endedAt && started < todayStart)) {
      sessionsToday += 1
    }

    const todayDuration = Math.max(
      0,
      Math.min(ended, todayEnd) - Math.max(started, todayStart),
    )
    todaySeconds += Math.floor(todayDuration / 1000)
  }

  return {
    sessionsToday,
    todayMinutes: Math.floor(todaySeconds / 60),
    totalMinutes: Math.floor(totalSeconds / 60),
  }
}

function elapsedSeconds(startedAt: string, endedAt: number): number {
  const start = Date.parse(startedAt)
  if (!Number.isFinite(start) || !Number.isFinite(endedAt)) {
    return 0
  }
  return Math.max(0, Math.floor((endedAt - start) / 1000))
}

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours === 0) {
    return `${remainingMinutes} min`
  }
  if (remainingMinutes === 0) {
    return `${hours} h`
  }
  return `${hours} h ${remainingMinutes} min`
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : 'Não foi possível carregar as sessões de foco.'
}
