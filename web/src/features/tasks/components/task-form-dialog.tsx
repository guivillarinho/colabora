import { Plus } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'

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
import { AttachmentField } from './attachment-field'
import { LocationField } from './location-field'

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
        className="h-12 rounded-xl bg-black px-6 text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
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

export function TaskFormDialog({
  task,
  open,
  onOpenChange,
  trigger,
}: TaskFormDialogProps & { trigger?: ReactNode }) {
  const { createTask, updateTask } = useTasks()
  const [formError, setFormError] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState(
    categoryByName(task?.category).name,
  )
  const [location, setLocation] = useState(task?.location ?? '')
  const [attachmentName, setAttachmentName] = useState<string | null>(
    task?.attachments[0] ?? null,
  )
  const [formKey, setFormKey] = useState(0)
  const editing = Boolean(task)
  const fieldPrefix = task ? `edit-${task.id}` : 'create'
  const selectedCategory = categoryByName(categoryName)

  function resetFields() {
    setFormError(null)
    setCategoryName(categoryByName(task?.category).name)
    setLocation(task?.location ?? '')
    setAttachmentName(task?.attachments[0] ?? null)
    setFormKey((current) => current + 1)
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      resetFields()
    }

    onOpenChange?.(next)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const form = event.currentTarget
    const formData = new FormData(form)
    const title = String(formData.get('title') ?? '').trim()

    if (!title) {
      return
    }

    const dueDate = String(formData.get('dueDate') ?? '')
    const input: TaskInput = {
      title,
      description: String(formData.get('description') ?? '').trim(),
      category: selectedCategory.name,
      priority: String(formData.get('priority') ?? 'medium') as TaskPriority,
      color: selectedCategory.color,
      estimatedTime: Number(formData.get('estimatedTime') ?? 60),
      location: location.trim(),
      attachments: attachmentName ? [attachmentName] : [],
      ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
    }

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
    }

    resetFields()
    onOpenChange?.(false)
    form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="flex max-h-[85svh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{editing ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
          <DialogDescription>
            Comece pelo título. Anexos e localização ficam nas opções avançadas.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
          key={`${task?.id ?? 'new'}-${formKey}`}
          onSubmit={handleSubmit}
        >
          <div className="grid shrink-0 gap-2">
            <Label htmlFor={`${fieldPrefix}-title`}>Título</Label>
            <Input
              defaultValue={task?.title ?? ''}
              id={`${fieldPrefix}-title`}
              name="title"
              placeholder="O que precisa ser feito?"
              required
            />
          </div>
          <div className="grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto">
            <div className="grid gap-2">
              <Label htmlFor={`${fieldPrefix}-description`}>Descrição</Label>
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
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              <div className="grid min-w-0 gap-2">
                <Label htmlFor={`${fieldPrefix}-due`}>Data e hora</Label>
                <Input
                  defaultValue={toDateTimeLocal(task?.dueDate ?? null)}
                  id={`${fieldPrefix}-due`}
                  name="dueDate"
                  type="datetime-local"
                />
              </div>
              <div className="grid min-w-0 gap-2">
                <Label htmlFor={`${fieldPrefix}-estimate`}>
                  Tempo estimado (min)
                </Label>
                <Input
                  defaultValue={task?.estimatedTime ?? 60}
                  id={`${fieldPrefix}-estimate`}
                  min={1}
                  name="estimatedTime"
                  required
                  type="number"
                />
              </div>
            </div>
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button className="w-full" type="button" variant="outline">
                  Opções avançadas
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="grid min-w-0 gap-4 pt-4">
                <AttachmentField
                  id={`${fieldPrefix}-attachment`}
                  initialName={task?.attachments[0]}
                  onChange={setAttachmentName}
                />
                <LocationField
                  id={`${fieldPrefix}-location`}
                  value={location}
                  onChange={setLocation}
                />
              </CollapsibleContent>
            </Collapsible>
            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <DialogFooter className="mx-0 mb-0">
              <Button type="submit">Salvar tarefa</Button>
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
