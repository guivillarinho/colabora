import { useEffect, useState } from 'react'
import {
  fetchTaskCategories,
  type ApiTaskCategory,
} from '@/features/tasks/task-categories-api'
import { Button } from '@/components/ui/button'
import {
  defaultGooglePreferences,
  googleCalendars,
  googleConnect,
  googleDisconnect,
  googleStatus,
  saveGooglePreferences,
  type GooglePreferences,
  type GoogleStatus,
} from './google-api'

const states: Record<string, string> = {
  synced: 'Sincronizado',
  pending: 'Pendente',
  error: 'Erro',
  conflict: 'Conflito',
}

export function GoogleSettings() {
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [preferences, setPreferences] = useState<GooglePreferences>(
    defaultGooglePreferences,
  )
  const [calendars, setCalendars] = useState<
    Array<{ id: string; summary: string }>
  >([])
  const [catalog, setCatalog] = useState<ApiTaskCategory[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(() => {
    const outcome = new URLSearchParams(window.location.search).get('google')
    if (outcome === 'connected') return 'Conta Google vinculada com sucesso.'
    if (outcome === 'cancelled')
      return 'Vinculação cancelada. Você pode tentar novamente.'
    if (outcome === 'error')
      return 'Não foi possível vincular a conta Google. Tente novamente.'
    return ''
  })
  useEffect(() => {
    let active = true
    const url = new URL(window.location.href)
    if (url.searchParams.has('google')) {
      url.searchParams.delete('google')
      window.history.replaceState(
        null,
        '',
        url.pathname + url.search + url.hash,
      )
    }
    googleStatus()
      .then((value) => {
        if (!active) return
        setStatus(value)
        setPreferences(value.preferences ?? defaultGooglePreferences)
        if (value.configured && value.status === 'connected') {
          fetchTaskCategories()
            .then((items) => {
              if (active) setCatalog(items)
            })
            .catch(() => undefined)
        }
      })
      .catch(() => {
        if (active)
          setMessage('Não foi possível consultar a integração Google.')
      })
    return () => {
      active = false
    }
  }, [])
  async function refresh() {
    const value = await googleStatus()
    setStatus(value)
    setPreferences(value.preferences ?? defaultGooglePreferences)
  }
  async function connect() {
    const result = await googleConnect()
    const url = new URL(result.url)
    if (url.origin !== 'https://accounts.google.com')
      throw new Error('URL de autorização inválida.')
    window.location.assign(url.href)
  }
  async function act(
    action: 'connect' | 'disconnect' | 'status' | 'save' | 'lists',
  ) {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      if (action === 'status') {
        await refresh()
        return
      }
      if (action === 'connect') {
        await connect()
        return
      }
      if (action === 'lists') {
        const [calendarItems, categoryItems] = await Promise.all([
          googleCalendars(),
          fetchTaskCategories(),
        ])
        setCalendars(calendarItems)
        setCatalog(categoryItems)
        setMessage('Calendários e categorias carregados.')
        return
      }
      if (action === 'save') {
        await saveGooglePreferences(preferences)
        await refresh()
        setMessage('Preferências de sincronização salvas.')
        return
      }
      await googleDisconnect()
      setMessage(
        'Conta Google desconectada. Eventos e tarefas já enviados permanecem no Google.',
      )
      await refresh()
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : 'Não foi possível concluir.',
      )
      googleStatus()
        .then(setStatus)
        .catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }
  const connection = !status
    ? message
      ? 'Consulta da integração indisponível.'
      : 'Consultando integração...'
    : status.status === 'connected'
      ? status.email
        ? `Conta vinculada: ${status.email}`
        : 'Conta vinculada.'
      : status.status === 'reconnect'
        ? 'Permissão expirada ou revogada. Reconecte sua conta.'
        : status.status === 'disconnecting'
          ? 'Revogação pendente: tente desconectar novamente.'
          : 'Conta não vinculada.'
  return (
    <section className="surface-panel grid min-w-0 gap-3 rounded-2xl border p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Google Agenda</h2>
      <p className="text-sm text-muted-foreground">
        Vincule sua conta para enviar tarefas com prazo ao Google Tasks e
        eventos ou projetos ao Google Agenda. A volta do calendário chega por
        notificação; alterações feitas nas Google Tasks podem levar cerca de
        dois minutos.
      </p>
      <p role="status">{connection}</p>
      {status?.status === 'connected' ? (
        <p className="text-sm">
          Estado: <strong>Conectado</strong>
        </p>
      ) : null}
      {status?.status === 'reconnect' ? (
        <p className="text-sm">
          Estado: <strong>Token expirado</strong>
        </p>
      ) : null}
      {status?.status === 'disconnected' ? (
        <p className="text-sm">
          Estado: <strong>Desconectado</strong>
        </p>
      ) : null}
      {status?.lastError?.message ? (
        <p className="text-sm text-destructive" role="alert">
          {status.lastError.message}
        </p>
      ) : null}
      {!status && message ? (
        <Button disabled={busy} onClick={() => act('status')}>
          Tentar novamente
        </Button>
      ) : null}
      {status && !status.configured ? (
        <p className="text-sm text-muted-foreground">
          A conexão com o Google Agenda estará disponível assim que a
          configuração for concluída.
        </p>
      ) : null}
      {status ? (
        <div className="flex flex-wrap gap-2">
          {['disconnected', 'reconnect'].includes(status.status) ? (
            <Button
              disabled={busy || !status.configured}
              onClick={() => act('connect')}
            >
              {status.status === 'disconnected'
                ? 'Vincular Google Agenda'
                : 'Reconectar Google Agenda'}
            </Button>
          ) : null}
          {status.status !== 'disconnected' ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => act('disconnect')}
            >
              Desconectar Google
            </Button>
          ) : null}
        </div>
      ) : null}
      {status?.configured && status.status === 'connected' ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            act('save').catch(() => undefined)
          }}
        >
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={preferences.autoSync}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  autoSync: event.target.checked,
                }))
              }
            />
            Sincronizar automaticamente criações, edições e exclusões
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={preferences.inboundEnabled}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  inboundEnabled: event.target.checked,
                }))
              }
            />
            Receber alterações feitas no Google
          </label>
          <label className="grid gap-1 text-sm">
            Calendário padrão
            {calendars.length ? (
              <select
                className="h-11 rounded-lg border bg-card px-3"
                value={preferences.defaultCalendarId}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    defaultCalendarId: event.target.value,
                  }))
                }
              >
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.summary}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="h-11 rounded-lg border bg-card px-3"
                value={preferences.defaultCalendarId}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    defaultCalendarId: event.target.value,
                  }))
                }
              />
            )}
          </label>
          <Button type="button" variant="outline" onClick={() => act('lists')}>
            Carregar calendários e categorias
          </Button>
          {catalog.length ? (
            <p className="text-sm text-muted-foreground">
              {catalog.filter((item) => item.googleListId).length} de{' '}
              {catalog.length} categorias com lista no Google Tasks. Estados:{' '}
              {catalog.filter((item) => item.syncState === 'synced').length}{' '}
              sincronizadas,{' '}
              {catalog.filter((item) => item.syncState === 'pending').length}{' '}
              pendentes,{' '}
              {catalog.filter((item) => item.syncState === 'conflict').length}{' '}
              em conflito.
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            Salvar sincronização
          </Button>
        </form>
      ) : null}
      {status?.links?.length ? (
        <ul className="grid gap-2">
          {status.links.map((link) => (
            <li key={`${link.entityType}-${link.entityId}`} className="text-sm">
              {link.entityType === 'task' ? 'Tarefa' : 'Agenda'} ·{' '}
              {states[link.syncState] ?? link.syncState} ·{' '}
              {new Date(link.syncedAt).toLocaleString()}
            </li>
          ))}
        </ul>
      ) : null}
      {busy ? <p role="status">Processando integração Google...</p> : null}
      {message ? (
        <p role="status" className="break-words">
          {message}
        </p>
      ) : null}
    </section>
  )
}
