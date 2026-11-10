import { useEffect, useState } from 'react'
import { apiRequest } from '@/lib/http-client'
import { useTasks } from '@/features/tasks/tasks-context'
import { Button } from '@/components/ui/button'
type Status = {
  configured: boolean
  status: string
  email?: string | null
  synced: Array<{ taskId: string; syncedAt: string }>
}
export function GoogleSettings() {
  const { tasks } = useTasks()
  const [status, setStatus] = useState<Status | null>(null)
  const [selected, setSelected] = useState('')
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
    apiRequest<Status>('/google/status')
      .then((value) => {
        if (active) setStatus(value)
      })
      .catch(() => {
        if (active)
          setMessage('Não foi possível consultar a integração Google.')
      })
    return () => {
      active = false
    }
  }, [])
  async function act(action: 'connect' | 'disconnect' | 'sync' | 'status') {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      if (action === 'status') {
        setStatus(await apiRequest<Status>('/google/status'))
        return
      }
      if (action === 'connect') {
        const result = await apiRequest<{ url: string }>('/google/connect', {
          method: 'POST',
        })
        const url = new URL(result.url)
        if (url.origin !== 'https://accounts.google.com')
          throw new Error('URL de autorização inválida.')
        window.location.assign(url.href)
        return
      }
      await apiRequest(`/google/${action}`, {
        method: 'POST',
        ...(action === 'sync'
          ? { body: JSON.stringify({ taskId: selected, confirmed: true }) }
          : {}),
      })
      setMessage(
        action === 'sync'
          ? 'Tarefa enviada ao Google Agenda.'
          : 'Conta Google desconectada. Eventos já enviados permanecem no Google.',
      )
      setStatus(await apiRequest<Status>('/google/status'))
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : 'Não foi possível concluir.',
      )
      apiRequest<Status>('/google/status')
        .then(setStatus)
        .catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }
  const last = status?.synced.find((item) => item.taskId === selected)
  return (
    <section className="surface-panel grid min-w-0 gap-3 rounded-2xl border p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Google Agenda</h2>
      <p className="text-sm text-muted-foreground">
        Conecte sua conta Google e envie as tarefas que escolher para o seu
        calendário principal.
      </p>
      <p className="text-sm text-muted-foreground">
        Ao vincular, escolha a conta que deseja usar e autorize o acesso à
        agenda.
      </p>
      <p role="status">
        {!status
          ? message
            ? 'Consulta da integração indisponível.'
            : 'Consultando integração...'
          : status.status === 'connected'
            ? status.email
              ? `Conta vinculada: ${status.email}`
              : 'Conta vinculada.'
            : status?.status === 'reconnect'
              ? 'Permissão expirada ou revogada. Reconecte sua conta.'
              : status?.status === 'disconnecting'
                ? 'Revogação pendente: tente desconectar novamente.'
                : 'Conta não vinculada.'}
      </p>
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
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            act('sync')
          }}
        >
          <fieldset disabled={busy} className="grid min-w-0 gap-2">
            <legend className="mb-2 text-sm font-medium">
              Escolha a tarefa com data e horário
            </legend>
            <div className="grid max-h-60 gap-2 overflow-y-auto">
              {tasks
                .filter((task) => task.dueDate)
                .map((task) => (
                  <label
                    key={task.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-secondary"
                  >
                    <input
                      type="radio"
                      name="google-task"
                      className="size-4 accent-primary"
                      checked={selected === task.id}
                      value={task.id}
                      onChange={() => setSelected(task.id)}
                    />
                    <span className="min-w-0 break-words">{task.title}</span>
                  </label>
                ))}
              {!tasks.some((task) => task.dueDate) && (
                <p className="text-sm text-muted-foreground">
                  Crie uma tarefa com data e horário para enviar ao Google
                  Agenda.
                </p>
              )}
            </div>
          </fieldset>
          <p className="text-sm text-muted-foreground">
            Ao confirmar, título, descrição, data e duração da tarefa serão
            enviados ao Google Agenda.
          </p>
          <p>
            Reenvios atualizam o mesmo evento. Alterações e exclusões no
            Colabora ou no Google não são sincronizadas automaticamente.
          </p>
          {last ? (
            <p>
              Último envio: {new Date(last.syncedAt).toLocaleString()}. Reenvie
              após editar a tarefa.
            </p>
          ) : null}
          <Button type="submit" disabled={busy || !selected} aria-busy={busy}>
            Confirmar envio ao Google Agenda
          </Button>
        </form>
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
