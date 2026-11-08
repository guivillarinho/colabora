import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNavigation } from '@/components/layout/navigation'
import { apiRequest } from '@/lib/http-client'
import { taskWindow } from '@/features/tasks/task-kind'
import type { Task } from '@/features/tasks/types/task'
import { AgendaDetails } from '@/features/dashboard/agenda-page'
import { useTasks } from '@/features/tasks/tasks-context'
type Proposal = {
  reply: string
  title: string
  description: string
  dueDate: string
  priority: 'low' | 'medium' | 'high'
  estimatedTime: number
  ready: boolean
}
export function ChatPage() {
  const { goTo } = useNavigation()
  const { completeTask, removeTask, acceptTask } = useTasks()
  const [messages, setMessages] = useState<
    Array<{ role: string; text: string }>
  >([])
  const [text, setText] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Proposal | null>(null)
  const [saved, setSaved] = useState<Task | null>(null)
  const [opened, setOpened] = useState(false)
  const requestId = useRef('')
  const pending = useRef(false)
  async function send() {
    if (pending.current || !text.trim() || !consent) return
    pending.current = true
    setBusy(true)
    setError('')
    setDraft(null)
    setSaved(null)
    const next = [...messages, { role: 'user', text: text.trim() }].slice(-8)
    try {
      const reply = await apiRequest<Proposal>('/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: next
            .map((m) => `${m.role}: ${m.text}`)
            .join('\n')
            .slice(-6000),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          consent,
        }),
      })
      setMessages([...next, { role: 'assistant', text: reply.reply }])
      setText('')
      if (reply.ready) {
        setDraft(reply)
        requestId.current = crypto.randomUUID()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  async function save() {
    if (!draft || pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const task = await apiRequest<Task>('/assistant/confirm', {
        method: 'POST',
        body: JSON.stringify({
          requestId: requestId.current,
          confirmed: true,
          title: draft.title,
          description: draft.description,
          dueDate: draft.dueDate,
          priority: draft.priority,
          estimatedTime: Number(draft.estimatedTime),
          category: 'Pessoal',
          color: 'purple',
        }),
      })
      acceptTask(task)
      setSaved(task)
      setDraft(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <section className="grid min-w-0 gap-4">
      <Button
        variant="outline"
        className="justify-self-start"
        onClick={() => goTo('hoje')}
      >
        Voltar ao início
      </Button>
      <h1 className="text-2xl font-semibold">Assistente Gemini</h1>
      <p className="text-sm text-muted-foreground">
        Planeje uma tarefa por vez. Informe título, data e horário. A IA pode
        errar: revise a prévia. Áudio e imagens ainda não estão disponíveis.
      </p>
      <Label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={busy}
        />
        Autorizo enviar esta conversa ao Google. Evitarei dados sensíveis; na
        modalidade gratuita os dados podem ser usados para melhorar produtos.
      </Label>
      <div
        role="log"
        aria-label="Conversa"
        aria-live="polite"
        className="grid gap-3"
      >
        {!messages.length ? (
          <p>Como posso ajudar a organizar sua próxima tarefa?</p>
        ) : (
          messages.map((m, i) => (
            <p
              key={i}
              className={`whitespace-pre-wrap break-words rounded-xl border p-3 ${m.role === 'user' ? 'ml-6 bg-primary/10' : 'mr-6 surface-panel'}`}
            >
              <strong>{m.role === 'user' ? 'Você' : 'Gemini'}: </strong>
              {m.text}
            </p>
          ))
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        className="grid gap-2"
      >
        <Label htmlFor="chat-message">Mensagem</Label>
        <textarea
          id="chat-message"
          className="min-h-24 rounded-xl border bg-background p-3"
          value={text}
          maxLength={2000}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
        />
        <Button disabled={busy || !consent || !text.trim()} type="submit">
          {busy ? 'Aguarde...' : 'Enviar'}
        </Button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {draft ? (
        <form
          className="surface-panel grid gap-3 rounded-xl border p-4"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <h2 className="text-lg font-semibold">Revise antes de criar</h2>
          <Label htmlFor="proposal-title">Título</Label>
          <Input
            id="proposal-title"
            required
            maxLength={120}
            disabled={busy}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <Label htmlFor="proposal-description">Descrição</Label>
          <Input
            id="proposal-description"
            maxLength={2000}
            disabled={busy}
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
          <Label htmlFor="proposal-date">Data e horário (ISO com fuso)</Label>
          <Input
            id="proposal-date"
            required
            disabled={busy}
            value={draft.dueDate}
            onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
          />
          <p>
            Horário local: {new Date(draft.dueDate).toLocaleString()} ·{' '}
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </p>
          <Label htmlFor="proposal-priority">Prioridade</Label>
          <select
            id="proposal-priority"
            disabled={busy}
            value={draft.priority}
            onChange={(e) =>
              setDraft({
                ...draft,
                priority: e.target.value as Proposal['priority'],
              })
            }
          >
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
          </select>
          <Label htmlFor="proposal-duration">Duração estimada (minutos)</Label>
          <Input
            id="proposal-duration"
            type="number"
            min={1}
            max={10080}
            required
            disabled={busy}
            value={draft.estimatedTime}
            onChange={(e) =>
              setDraft({ ...draft, estimatedTime: Number(e.target.value) })
            }
          />
          <p>Categoria: Pessoal · Cor: roxo</p>
          <Button disabled={busy || !consent} type="submit">
            Confirmar e criar tarefa
          </Button>
        </form>
      ) : null}
      {saved ? (
        <div role="status">
          Tarefa criada: {saved.title}.{' '}
          <Button onClick={() => setOpened(true)}>Abrir tarefa</Button>
          <Button
            variant="outline"
            onClick={() => {
              setMessages([])
              setSaved(null)
            }}
          >
            Nova conversa
          </Button>
        </div>
      ) : null}
      {saved && opened ? (
        <AgendaDetails
          item={{
            ...saved,
            type: 'task',
            ...taskWindow(saved),
            icon: null,
            task: saved,
          }}
          onClose={() => setOpened(false)}
          onComplete={async () => {
            await completeTask(saved.id)
            setOpened(false)
          }}
          onDelete={async () => {
            await removeTask(saved.id)
            setOpened(false)
          }}
        />
      ) : null}
    </section>
  )
}
