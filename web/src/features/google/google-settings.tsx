import { useEffect, useState } from 'react'
import { apiRequest } from '@/lib/http-client'
import { useTasks } from '@/features/tasks/tasks-context'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
type Status = {
  configured: boolean
  status: string
  synced: Array<{ taskId: string; syncedAt: string }>
}
export function GoogleSettings() {
  const { tasks } = useTasks()
  const [status, setStatus] = useState<Status | null>(null)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
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
      <h2 className="text-lg font-semibold">Integrações Google</h2>
      <p>
        Google Agenda: envio manual para o calendário principal. Nenhuma tarefa
        será enviada automaticamente. Google poderá receber título, descrição,
        data e duração da tarefa selecionada.
      </p>
      <p role="status">
        {!status
          ? message
            ? 'Consulta da integração indisponível.'
            : 'Consultando integração...'
          : status.status === 'connected'
            ? 'Conta vinculada.'
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
        <p>A integração ainda não está configurada no servidor.</p>
      ) : null}
      {status && (status.configured || status.status !== 'disconnected') ? (
        <div className="flex flex-wrap gap-2">
          {status.configured &&
          ['disconnected', 'reconnect'].includes(status.status) ? (
            <Button disabled={busy} onClick={() => act('connect')}>
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
          <Label htmlFor="google-task">
            Escolha a tarefa com data e horário
          </Label>
          <select
            id="google-task"
            className="min-w-0 rounded-lg border bg-background p-2"
            required
            disabled={busy}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">Selecione uma tarefa</option>
            {tasks
              .filter((task) => task.dueDate)
              .map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
          </select>
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
      <h3 className="font-semibold">Google Chat</h3>
      <p>
        Chat é diferente de Gmail. A integração depende de conta Google
        Workspace, espaço e permissões do administrador; não há vinculação
        disponível nesta versão. Use as notificações do Colabora como
        alternativa. Nenhuma mensagem será enviada ao Google Chat.
      </p>
    </section>
  )
}
