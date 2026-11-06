import { useEffect, useState, useRef } from 'react'
import { History, Play, Timer, TimerReset } from 'lucide-react'

import { MutedText, PageTitle, SectionTitle } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { focusSessionsApi } from './focus-sessions-api'
import type { FocusSession } from './types'

const recentSessionLimit = 5

export function TimerPage() {
  const [focusMinutes, setFocusMinutes] = useState(25)
  const [breakMinutes, setBreakMinutes] = useState(5)
  const [celebration, setCelebration] = useState(false)
  const finishing = useRef(false)
  const [sessions, setSessions] = useState<FocusSession[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [showAllSessions, setShowAllSessions] = useState(false)

  useEffect(() => {
    let mounted = true
    const controller = new AbortController()

    focusSessionsApi
      .list(controller.signal)
      .then((data) => {
        if (mounted) {
          setSessions(data)
          const latestFinished = data.find((session) => session.endedAt)
          if (
            latestFinished &&
            isFullCycle(latestFinished) &&
            Date.now() <
              Date.parse(latestFinished.endedAt!) +
                (latestFinished.breakMinutes ?? 5) * 60_000
          ) {
            setCelebration(true)
          }
          const previous = data.find((session) => session.focusMinutes)
          if (previous) {
            setFocusMinutes(previous.focusMinutes!)
            setBreakMinutes(previous.breakMinutes ?? 5)
          }
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
      controller.abort()
    }
  }, [])

  const activeSession = sessions.find((session) => session.endedAt === null)
  const completedSessions = sessions.filter((session) => session.endedAt)

  const latest = completedSessions[0]
  const breakEnd =
    latest && isFullCycle(latest)
      ? Date.parse(latest.endedAt!) + (latest.breakMinutes ?? 5) * 60_000
      : 0
  const resting = !activeSession && breakEnd > now
  const cycles = completedSessions.filter(isFullCycle).length

  useEffect(() => {
    if (!activeSession && !resting) {
      return
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [activeSession, resting])

  async function handleStart(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const session = await focusSessionsApi.start(
        title.trim(),
        focusMinutes,
        breakMinutes,
      )
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
    if (!activeSession || finishing.current) {
      return
    }

    finishing.current = true
    setSaving(true)
    setError(null)

    try {
      const finished = await focusSessionsApi.finish(activeSession.id)
      setCelebration(isFullCycle(finished))
      setNow(Date.now())
      setSessions((current) =>
        current.map((session) =>
          session.id === finished.id ? finished : session,
        ),
      )
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      finishing.current = false
      setSaving(false)
    }
  }

  useEffect(() => {
    if (
      activeSession?.focusMinutes &&
      !saving &&
      !error &&
      now >=
        Date.parse(activeSession.startedAt) +
          activeSession.focusMinutes * 60_000
    ) {
      handleFinish()
    }
  })

  const visibleSessions = showAllSessions
    ? completedSessions
    : completedSessions.slice(0, recentSessionLimit)
  const hiddenSessions = completedSessions.length - visibleSessions.length

  return (
    <div className="grid gap-6 sm:gap-8">
      <div className="grid gap-1">
        <PageTitle>Timer</PageTitle>
        <MutedText>
          Alterne foco e descanso. Cada ciclo completo vale 100 pontos.
        </MutedText>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section aria-label="Sessão de foco" className="grid gap-3">
        <SectionTitle>Seu foco agora</SectionTitle>
        <article className="glass-panel grid justify-items-center gap-5 rounded-2xl border p-5 text-center sm:p-8">
          {celebration ? (
            <div
              role="status"
              className="relative w-full overflow-hidden rounded-2xl bg-pastel-purple/60 p-5 motion-safe:animate-in motion-safe:zoom-in"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
              >
                {Array.from({ length: 20 }, (_, index) => (
                  <span
                    key={index}
                    className="absolute top-0 h-3 w-2 rounded-sm bg-primary/50 motion-safe:animate-colabora-confetti"
                    style={{
                      left: `${index * 5}%`,
                      animationDelay: `${(index % 5) * 80}ms`,
                    }}
                  />
                ))}
              </div>
              <span aria-hidden="true" className="text-4xl">
                🏆 ✨
              </span>
              <h2 className="mt-2 text-xl font-semibold">
                Foco concluído! +100 pontos
              </h2>
              <p>Você conquistou mais um ciclo. Aproveite seu descanso!</p>
              <Button variant="ghost" onClick={() => setCelebration(false)}>
                Continuar
              </Button>
            </div>
          ) : null}
          {resting ? (
            <div className="grid justify-items-center gap-4">
              <h2 className="text-xl font-semibold">Hora de descansar</h2>
              <MutedText>
                Respire, alongue e recarregue. O próximo foco começa quando você
                quiser.
              </MutedText>
              <TimerFace
                seconds={Math.max(0, Math.ceil((breakEnd - now) / 1000))}
              />
            </div>
          ) : activeSession ? (
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
                seconds={
                  activeSession.focusMinutes
                    ? Math.max(
                        0,
                        activeSession.focusMinutes * 60 -
                          elapsedSeconds(activeSession.startedAt, now),
                      )
                    : elapsedSeconds(activeSession.startedAt, now)
                }
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
                className="grid w-full max-w-md gap-3 sm:items-end"
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
                <div className="grid grid-cols-2 gap-3 text-left">
                  <div className="grid gap-2">
                    <Label htmlFor="focus-minutes">Foco (minutos)</Label>
                    <Input
                      id="focus-minutes"
                      type="number"
                      min={1}
                      max={180}
                      required
                      value={focusMinutes || ''}
                      onChange={(event) =>
                        setFocusMinutes(Number(event.target.value))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="break-minutes">Descanso (minutos)</Label>
                    <Input
                      id="break-minutes"
                      type="number"
                      min={1}
                      max={60}
                      required
                      value={breakMinutes || ''}
                      onChange={(event) =>
                        setBreakMinutes(Number(event.target.value))
                      }
                    />
                  </div>
                </div>
                <Button
                  className="w-full sm:w-auto"
                  disabled={saving || loading}
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
      <article
        className="glass-panel grid gap-3 rounded-2xl border p-5"
        aria-label="Conquistas de foco"
      >
        <div className="flex flex-wrap justify-between gap-2">
          <SectionTitle>🏆 Nível {Math.floor(cycles / 5) + 1}</SectionTitle>
          <span>
            {cycles * 100} pontos · {cycles} ciclos completos
          </span>
        </div>
        <div
          aria-label="Progresso para o próximo nível"
          aria-valuemax={5}
          aria-valuemin={0}
          aria-valuenow={cycles % 5}
          className="h-3 overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
            style={{ width: `${((cycles % 5) / 5) * 100}%` }}
          />
        </div>
        <MutedText>
          Mais {5 - (cycles % 5)} ciclos para o próximo nível. Sessões
          encerradas antes do prazo contam como tempo de foco, sem pontos.
        </MutedText>
      </article>
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

function TimerFace({ seconds }: { seconds: number }) {
  return (
    <div className="grid size-52 place-items-center rounded-full border-[10px] border-primary/15 bg-secondary/50 sm:size-60">
      <p
        aria-label={`Tempo restante: ${formatElapsed(seconds)}`}
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
      <article className="glass-panel grid min-w-0 gap-2 rounded-2xl border p-4">
        <h3 className="truncate font-medium" title={session.title}>
          {session.title}
        </h3>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
        {session.focusMinutes ? (
          <p className="text-sm text-muted-foreground">
            Meta: {session.focusMinutes} min · Descanso: {session.breakMinutes}{' '}
            min ·{' '}
            {isFullCycle(session)
              ? 'Concluído · +100 pontos'
              : 'Encerrado antes do prazo'}
          </p>
        ) : null}
        <p className="font-mono text-lg font-semibold tabular-nums text-primary">
          {formatElapsed(duration)}
        </p>
      </article>
    </li>
  )
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

function errorMessage(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : 'Não foi possível carregar as sessões de foco.'
}

function isFullCycle(session: FocusSession): boolean {
  return Boolean(
    session.focusMinutes &&
    session.endedAt &&
    Date.parse(session.endedAt) - Date.parse(session.startedAt) >=
      session.focusMinutes * 60_000,
  )
}
