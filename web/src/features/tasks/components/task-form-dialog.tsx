import { useAuth } from '@/features/auth/auth-context'
import { AssigneeField } from './assignee-field'
import { MinutesInput, parseMinutes } from './minutes-input'
import { CalendarDays, NotebookPen, Plus, Timer } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

import { pastelSwatches } from '@/components/pastel'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isFutureReminder, ReminderField } from '@/components/reminder-field'
import { GoogleSyncHint } from '@/features/google/google-sync-hint'
import {
  createTaskCategory,
  fetchTaskCategories,
  type ApiTaskCategory,
} from '../task-categories-api'
import { formatDueDate } from '@/lib/format-duration'
import { showToast } from '@/lib/toast'
import { cn } from 'cn'

import { categoryByName, taskCategories } from '../task-categories'
import { useTasks } from '../tasks-context'
import type { Task, TaskInput, TaskPriority } from '../types/task'
import { AttachmentField, persistedAttachment } from './attachment-field'
import { LocationField } from './location-field'
import { suggestTaskDate } from '../suggest-task-date'

type TaskFormDialogProps = {
  task?: Task
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type CreateTaskDialogProps = {
  variant?: 'default' | 'icon'
}

export function CreateTaskDialog({
  variant = 'default',
}: CreateTaskDialogProps) {
  const [open, setOpen] = useState(false)
  const trigger =
    variant === 'icon' ? (
      <Button
        aria-label="Criar tarefa"
        className="h-12 rounded-xl bg-primary px-6 text-primary-foreground hover:bg-primary/90"
        type="button"
      >
        <Plus className="size-5" />
      </Button>
    ) : (
      <Button className="h-11 px-5 text-base" size="lg" type="button">
        Criar tarefa
      </Button>
    )

  return <TaskFormDialog open={open} trigger={trigger} onOpenChange={setOpen} />
}

export function TaskFormDialog(
  props: TaskFormDialogProps & { trigger?: ReactNode },
) {
  return (
    <TaskFormContent
      key={props.task ? `${props.task.id}-${props.task.updatedAt}` : 'new'}
      {...props}
    />
  )
}

function TaskFormContent({
  task,
  open,
  onOpenChange,
  trigger,
}: TaskFormDialogProps & { trigger?: ReactNode }) {
  const { createTask, updateTask } = useTasks()
  const { user } = useAuth()
  const [assignee, setAssignee] = useState(
    task ? task.assignedTo : user ? { id: user.id, name: user.name } : null,
  )
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(
    task?.categoryId ?? null,
  )
  const [location, setLocation] = useState(task?.location ?? '')
  const [attachmentReference, setAttachmentReference] = useState<string | null>(
    persistedAttachment(task?.attachments[0]),
  )
  const [attachmentPending, setAttachmentPending] = useState(false)
  const [creationMode, setCreationMode] = useState<'scheduled' | 'timer'>(
    'scheduled',
  )
  const [formKey, setFormKey] = useState(0)
  const [title, setTitle] = useState(task?.title ?? '')
  const [syncOptOut, setSyncOptOut] = useState(false)
  const [dueDate, setDueDate] = useState(toDateTimeLocal(task?.dueDate ?? null))
  const initialReminders = task?.dueDate
    ? (task.reminderOffsets ?? [10, 0])
    : []
  const [reminders, setReminders] = useState({
    offsets: initialReminders,
    custom: Boolean(task),
  })
  const [scheduleSource, setScheduleSource] = useState<
    'title' | 'manual' | null
  >(task?.dueDate ? 'manual' : null)
  const editing = Boolean(task)
  const fieldPrefix = task ? `edit-${task.id}` : 'create'

  const [categories, setCategories] = useState<ApiTaskCategory[]>([])
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [newCategoryInput, setNewCategoryInput] = useState('')

  useEffect(() => {
    let active = true
    if (!open) return
    fetchTaskCategories()
      .then((items) => {
        if (!active) return
        setCategories(items)
        if (!categoryId && items[0]) setCategoryId(items[0].id)
        if (task?.categoryId) setCategoryId(task.categoryId)
        else if (task?.category) {
          const match = items.find(
            (item) => item.name.toLowerCase() === task.category.toLowerCase(),
          )
          if (match) setCategoryId(match.id)
        }
      })
      .catch(() => {
        if (!active) return
        const fallback = taskCategories.map((item) => ({
          id: item.name,
          name: item.name,
          color: item.color,
          googleListId: null,
          syncState: 'pending' as const,
        }))
        setCategories(fallback)
        if (!categoryId && fallback[0]) setCategoryId(fallback[0].id)
      })
    return () => {
      active = false
    }
  }, [open, task?.category, task?.categoryId])

  const selectedCategory = categories.find(
    (item) => item.id === categoryId,
  ) ?? {
    id: '',
    name: task?.category ?? taskCategories[0].name,
    color: categoryByName(task?.category).color,
    googleListId: null,
    syncState: 'pending' as const,
  }

  async function handleCreateCategory() {
    const trimmed = newCategoryInput.trim()
    if (!trimmed) {
      setCreatingCategory(false)
      return
    }
    const color = categoryByName(trimmed).color
    try {
      const created = await createTaskCategory({ name: trimmed, color })
      setCategories((current) => [...current, created])
      setCategoryId(created.id)
    } catch {
      const fallback = categoryByName(trimmed, categories)
      setCategories((current) => [
        ...current,
        {
          id: fallback.name,
          name: fallback.name,
          color: fallback.color,
          googleListId: null,
          syncState: 'pending',
        },
      ])
      setCategoryId(fallback.name)
    }
    setCreatingCategory(false)
    setNewCategoryInput('')
  }

  function resetFields() {
    setFormError(null)
    setCreatingCategory(false)
    setNewCategoryInput('')
    setAssignee(
      task ? task.assignedTo : user ? { id: user.id, name: user.name } : null,
    )
    setCategoryId(task?.categoryId ?? null)
    setLocation(task?.location ?? '')
    setAttachmentReference(persistedAttachment(task?.attachments[0]))
    setAttachmentPending(false)
    setCreationMode('scheduled')
    setTitle(task?.title ?? '')
    setDueDate(toDateTimeLocal(task?.dueDate ?? null))
    setReminders({ offsets: initialReminders, custom: Boolean(task) })
    setScheduleSource(task?.dueDate ? 'manual' : null)
    setFormKey((current) => current + 1)
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      resetFields()
    }

    onOpenChange?.(next)
  }

  function updateDueDate(next: string) {
    setDueDate(next)
    setReminders((current) => ({
      ...current,
      offsets: (current.custom ? current.offsets : [10, 0]).filter((minutes) =>
        isFutureReminder(next, minutes),
      ),
    }))
  }

  function updateScheduleFromTitle(nextTitle: string) {
    if (scheduleSource === 'manual') return
    const suggested = suggestTaskDate(nextTitle)
    updateDueDate(toDateTimeLocal(suggested?.toISOString() ?? null))
    setScheduleSource(suggested ? 'title' : null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || attachmentPending) return
    setFormError(null)
    const form = event.currentTarget
    const formData = new FormData(form)
    const title = String(formData.get('title') ?? '').trim()

    if (!title) {
      return
    }

    const estimatedTime = parseMinutes(
      String(formData.get('estimatedTime') ?? ''),
      1,
    )
    if (estimatedTime === null) {
      setFormError(
        'Informe o tempo estimado em minutos inteiros, de 1 a 10080.',
      )
      return
    }

    const dueDate = String(formData.get('dueDate') ?? '')
    const sameDate =
      Boolean(task) && dueDate === toDateTimeLocal(task?.dueDate ?? null)
    const previousOffsets = sameDate ? initialReminders : []
    const offsets =
      dueDate && creationMode !== 'timer'
        ? reminders.custom
          ? reminders.offsets
          : reminders.offsets.filter((minutes) =>
              isFutureReminder(dueDate, minutes),
            )
        : []
    if (
      offsets.some(
        (minutes) =>
          !previousOffsets.includes(minutes) &&
          !isFutureReminder(dueDate, minutes),
      )
    ) {
      setFormError('Um lembrete já passou. Remova-o ou altere a data e hora.')
      return
    }
    const attachment = persistedAttachment(attachmentReference)
    const priority = String(
      formData.get('priority') ?? 'medium',
    ) as TaskPriority
    const input: TaskInput = {
      assignedToId: assignee?.id ?? null,
      title,
      description: String(formData.get('description') ?? '').trim(),
      category: selectedCategory.name,
      ...(uuidLike(selectedCategory.id)
        ? { categoryId: selectedCategory.id }
        : {}),
      priority,
      color: selectedCategory.color,
      estimatedTime,
      reminderOffsets: offsets,
      location: location.trim(),
      attachments: attachment ? [attachment] : [],
      ...(!task && creationMode === 'timer' ? { startImmediately: true } : {}),
      ...(dueDate && creationMode !== 'timer'
        ? {
            dueDate: sameDate ? task?.dueDate : new Date(dueDate).toISOString(),
          }
        : task
          ? { dueDate: null }
          : {}),
      ...(syncOptOut ? { syncOptOut: true } : {}),
    }

    submitting.current = true
    setSaving(true)
    try {
      if (task) {
        await updateTask(task.id, input)
      } else {
        await createTask(input)
      }
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar a tarefa.',
      )
      return
    } finally {
      submitting.current = false
      setSaving(false)
    }

    resetFields()
    onOpenChange?.(false)
    form.reset()
    if (!task) {
      showToast({
        title: 'Tarefa criada com sucesso',
        itemTitle: title,
        description: input.description,
        variant: 'success',
      })
      return
    }

    const savedDue =
      dueDate && creationMode !== 'timer'
        ? sameDate
          ? (task?.dueDate ?? new Date(dueDate).toISOString())
          : new Date(dueDate).toISOString()
        : null
    const priorityLabel = { low: 'Baixa', medium: 'Média', high: 'Alta' }[
      priority
    ]
    const schedule = savedDue
      ? `Prazo ${formatDueDate(savedDue)}.`
      : 'Sem prazo.'
    const description = [
      `“${title}” na categoria ${selectedCategory.name}, prioridade ${priorityLabel}.`,
      schedule,
    ]
    description.push(`Tempo estimado: ${estimatedTime} min.`)
    if (input.description) description.push(`Descrição: ${input.description}`)
    if (input.location) description.push(`Local: ${input.location}`)
    if (assignee) description.push(`Responsável: ${assignee.name}.`)
    if (attachment) description.push(`Anexo: ${attachment.split('||')[0]}.`)
    if (savedDue) {
      description.push(
        offsets.length
          ? `Lembretes: ${offsets.map((minutes) => (minutes === 0 ? 'no horário' : `${minutes} min antes`)).join(', ')}.`
          : 'Sem lembretes.',
      )
    }
    showToast({
      title: 'Tarefa atualizada',
      description: description.join('\n'),
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        aria-describedby={
          editing ? `${fieldPrefix}-dialog-description` : undefined
        }
        className="flex max-h-[85svh] flex-col overflow-hidden sm:max-w-lg"
      >
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{editing ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
          {editing ? (
            <DialogDescription id={`${fieldPrefix}-dialog-description`}>
              {`Editando “${task.title}”. As alterações serão salvas somente nesta tarefa.`}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {!editing ? (
          <div
            aria-label="Tipo da nova atividade"
            className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-muted p-1"
            role="group"
          >
            <Button
              aria-pressed={creationMode === 'scheduled'}
              size="sm"
              variant="ghost"
              className={cn(
                'h-auto min-h-8 min-w-0 whitespace-normal rounded-lg px-2 py-1.5 text-xs leading-tight sm:text-sm',
                creationMode === 'scheduled'
                  ? 'border-border bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground',
              )}
              type="button"
              onClick={() => {
                setCreationMode('scheduled')
                updateScheduleFromTitle(title)
              }}
            >
              <NotebookPen aria-hidden="true" />
              Tarefa agendada
            </Button>
            <Button
              aria-pressed={creationMode === 'timer'}
              size="sm"
              variant="ghost"
              className={cn(
                'h-auto min-h-8 min-w-0 whitespace-normal rounded-lg px-2 py-1.5 text-xs leading-tight sm:text-sm',
                creationMode === 'timer'
                  ? 'border-border bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground',
              )}
              type="button"
              onClick={() => setCreationMode('timer')}
            >
              <Timer aria-hidden="true" />
              Tarefa cronometrada
            </Button>
          </div>
        ) : null}
        <form
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
          key={`${task?.id ?? 'new'}-${formKey}`}
          onSubmit={handleSubmit}
        >
          <div className="grid shrink-0 gap-2">
            <Label htmlFor={`${fieldPrefix}-title`}>Título</Label>
            <Input
              value={title}
              id={`${fieldPrefix}-title`}
              name="title"
              placeholder="Ex.: Enviar proposta às 9h"
              onChange={(event) => {
                const next = event.target.value
                setTitle(next)
                if (creationMode !== 'timer') updateScheduleFromTitle(next)
              }}
              required
            />
            {scheduleSource === 'title' &&
            dueDate &&
            creationMode !== 'timer' ? (
              <p
                role="status"
                className="flex items-center gap-1.5 text-xs font-medium text-primary"
              >
                <CalendarDays
                  aria-hidden="true"
                  className="size-3.5 shrink-0"
                />
                Horário reconhecido:{' '}
                {new Intl.DateTimeFormat('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(dueDate))}
              </p>
            ) : null}
          </div>
          <div className="-mx-3 grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto px-3 pb-3">
            {editing || creationMode !== 'timer' ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor={`${fieldPrefix}-description`}>
                    Descrição
                  </Label>
                  <textarea
                    className="min-h-28 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                    defaultValue={task?.description ?? ''}
                    id={`${fieldPrefix}-description`}
                    name="description"
                    placeholder="Conte o contexto, o que precisa acontecer e como você vai saber que terminou."
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${fieldPrefix}-priority`}>Prioridade</Label>
                  <select
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                    defaultValue={task?.priority ?? 'medium'}
                    id={`${fieldPrefix}-priority`}
                    name="priority"
                  >
                    <option value="high">Alta</option>
                    <option value="medium">Média</option>
                    <option value="low">Baixa</option>
                  </select>
                </div>
              </>
            ) : null}
            <fieldset className="grid min-w-0 gap-2">
              <legend className="text-sm font-medium">Categoria</legend>
              <div className="flex min-w-0 flex-wrap items-center gap-2 p-1.5">
                {categories.map((category) => {
                  const swatch = pastelSwatches.find(
                    (item) => item.id === category.color,
                  )

                  return (
                    <label
                      key={category.id}
                      className={cn(
                        'relative cursor-pointer rounded-full px-3 py-1 text-sm font-medium opacity-45 ring-2 ring-transparent ring-offset-2 ring-offset-popover transition has-[:checked]:opacity-100 has-[:checked]:ring-foreground',
                        swatch?.className,
                      )}
                    >
                      <input
                        checked={categoryId === category.id}
                        className="absolute inset-0 cursor-pointer opacity-0"
                        name="category"
                        type="radio"
                        value={category.id}
                        onChange={() => {
                          setCategoryId(category.id)
                        }}
                      />
                      {category.name}
                    </label>
                  )
                })}
                {creatingCategory ? (
                  <div className="grid w-full basis-full gap-2">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Nome da lista..."
                      aria-label="Nome da nova categoria"
                      className="h-8 w-full rounded-full border border-input bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                      value={newCategoryInput}
                      onChange={(e) => setNewCategoryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleCreateCategory()
                        } else if (e.key === 'Escape') {
                          setCreatingCategory(false)
                          setNewCategoryInput('')
                        }
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="h-8 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90"
                        onClick={() => {
                          handleCreateCategory()
                        }}
                      >
                        Criar
                      </button>
                      <button
                        type="button"
                        className="h-8 rounded-full border border-border bg-card px-3 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setCreatingCategory(false)
                          setNewCategoryInput('')
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex h-8 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground hover:border-foreground hover:text-foreground transition"
                    onClick={() => setCreatingCategory(true)}
                  >
                    <Plus aria-hidden="true" className="size-3.5" />
                    Nova lista / categoria
                  </button>
                )}
              </div>
            </fieldset>
            <div className="grid min-w-0 gap-3">
              {editing || creationMode !== 'timer' ? (
                <div className="grid min-w-0 gap-2">
                  <Label htmlFor={`${fieldPrefix}-due`}>Data e hora</Label>
                  <Input
                    value={dueDate}
                    id={`${fieldPrefix}-due`}
                    name="dueDate"
                    type="datetime-local"
                    onChange={(event) => {
                      updateDueDate(event.target.value)
                      setScheduleSource(event.target.value ? 'manual' : null)
                    }}
                  />
                </div>
              ) : null}
              {editing || creationMode !== 'timer' ? (
                <ReminderField
                  start={dueDate}
                  value={reminders.offsets}
                  onChange={(offsets) =>
                    setReminders({ offsets, custom: true })
                  }
                />
              ) : null}
              <div className="grid min-w-0 gap-2">
                <Label htmlFor={`${fieldPrefix}-estimate`}>
                  Tempo estimado (min)
                </Label>
                <MinutesInput
                  defaultValue={task?.estimatedTime ?? 60}
                  id={`${fieldPrefix}-estimate`}
                  minimum={1}
                  name="estimatedTime"
                  required
                />
              </div>
            </div>
            {!editing && creationMode === 'timer' ? (
              <p className="text-sm text-muted-foreground">
                O cronômetro começa ao salvar.
              </p>
            ) : null}
            {editing || creationMode !== 'timer' ? (
              <div className="grid gap-6 border-t pt-6">
                <AssigneeField value={assignee} onChange={setAssignee} />
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button className="w-full" type="button" variant="outline">
                      Opções avançadas
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="grid min-w-0 gap-4 pt-4">
                    <AttachmentField
                      id={`${fieldPrefix}-attachment`}
                      initialReference={persistedAttachment(
                        task?.attachments[0],
                      )}
                      onChange={setAttachmentReference}
                      onPendingChange={setAttachmentPending}
                    />
                    <LocationField
                      id={`${fieldPrefix}-location`}
                      value={location}
                      onChange={setLocation}
                    />
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ) : null}
            <GoogleSyncHint optOut={syncOptOut} onOptOut={setSyncOptOut} />
            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <DialogFooter className="mx-0 mb-0 px-0 py-3 sm:p-4">
              <Button
                className="h-9 w-full text-sm sm:w-auto"
                disabled={saving || attachmentPending}
                type="submit"
              >
                Salvar tarefa
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function uuidLike(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value)
}

function toDateTimeLocal(iso: string | null): string {
  if (!iso) {
    return ''
  }

  const date = new Date(iso)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)

  return local.toISOString().slice(0, 16)
}
