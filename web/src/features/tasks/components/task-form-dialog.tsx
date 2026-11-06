import { useAuth } from '@/features/auth/auth-context'
import { AssigneeField } from './assignee-field'
import { MinutesInput, parseMinutes } from './minutes-input'
import { CalendarDays, NotebookPen, Plus, Timer } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'

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
  const [categoryName, setCategoryName] = useState(
    categoryByName(task?.category).name,
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
  const [dueDate, setDueDate] = useState(toDateTimeLocal(task?.dueDate ?? null))
  const [scheduleSource, setScheduleSource] = useState<
    'title' | 'manual' | null
  >(task?.dueDate ? 'manual' : null)
  const editing = Boolean(task)
  const fieldPrefix = task ? `edit-${task.id}` : 'create'
  const selectedCategory = categoryByName(categoryName)

  function resetFields() {
    setFormError(null)
    setAssignee(
      task ? task.assignedTo : user ? { id: user.id, name: user.name } : null,
    )
    setCategoryName(categoryByName(task?.category).name)
    setLocation(task?.location ?? '')
    setAttachmentReference(persistedAttachment(task?.attachments[0]))
    setAttachmentPending(false)
    setCreationMode('scheduled')
    setTitle(task?.title ?? '')
    setDueDate(toDateTimeLocal(task?.dueDate ?? null))
    setScheduleSource(task?.dueDate ? 'manual' : null)
    setFormKey((current) => current + 1)
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      resetFields()
    }

    onOpenChange?.(next)
  }

  function updateScheduleFromTitle(nextTitle: string) {
    if (scheduleSource === 'manual') return
    const suggested = suggestTaskDate(nextTitle)
    setDueDate(toDateTimeLocal(suggested?.toISOString() ?? null))
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
    const attachment = persistedAttachment(attachmentReference)
    const input: TaskInput = {
      assignedToId: assignee?.id ?? null,
      title,
      description: String(formData.get('description') ?? '').trim(),
      category: selectedCategory.name,
      priority: String(formData.get('priority') ?? 'medium') as TaskPriority,
      color: selectedCategory.color,
      estimatedTime,
      location: location.trim(),
      attachments: attachment ? [attachment] : [],
      ...(!task && creationMode === 'timer' ? { startImmediately: true } : {}),
      ...(dueDate && creationMode !== 'timer'
        ? { dueDate: new Date(dueDate).toISOString() }
        : task
          ? { dueDate: null }
          : {}),
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
            className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1"
            role="group"
          >
            <Button
              aria-pressed={creationMode === 'scheduled'}
              size="sm"
              variant="ghost"
              className={cn(
                'h-auto min-h-8 min-w-0 whitespace-normal rounded-lg px-2 py-1.5 text-xs leading-tight sm:text-sm',
                creationMode === 'scheduled'
                  ? 'border-border bg-background/80 text-foreground shadow-xs'
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
                  ? 'border-border bg-background/80 text-foreground shadow-xs'
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
              <div className="flex min-w-0 flex-wrap gap-2 p-1.5">
                {taskCategories.map((category) => {
                  const swatch = pastelSwatches.find(
                    (item) => item.id === category.color,
                  )

                  return (
                    <label
                      key={category.name}
                      className={cn(
                        'relative cursor-pointer rounded-full px-3 py-1 text-sm font-medium opacity-45 ring-2 ring-transparent ring-offset-2 ring-offset-popover transition has-[:checked]:opacity-100 has-[:checked]:ring-foreground',
                        swatch?.className,
                      )}
                    >
                      <input
                        checked={categoryName === category.name}
                        className="absolute inset-0 cursor-pointer opacity-0"
                        name="category"
                        type="radio"
                        value={category.name}
                        onChange={() => {
                          setCategoryName(category.name)
                        }}
                      />
                      {category.name}
                    </label>
                  )
                })}
              </div>
            </fieldset>
            <div
              className={cn(
                'grid min-w-0 gap-2',
                (editing || creationMode !== 'timer') && 'sm:grid-cols-2',
              )}
            >
              {editing || creationMode !== 'timer' ? (
                <div className="grid min-w-0 gap-2">
                  <Label htmlFor={`${fieldPrefix}-due`}>Data e hora</Label>
                  <Input
                    value={dueDate}
                    id={`${fieldPrefix}-due`}
                    name="dueDate"
                    type="datetime-local"
                    onChange={(event) => {
                      setDueDate(event.target.value)
                      setScheduleSource(event.target.value ? 'manual' : null)
                    }}
                  />
                </div>
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

function toDateTimeLocal(iso: string | null): string {
  if (!iso) {
    return ''
  }

  const date = new Date(iso)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)

  return local.toISOString().slice(0, 16)
}
