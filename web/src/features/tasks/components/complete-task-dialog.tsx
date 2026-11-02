import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { MinutesInput, parseMinutes } from './minutes-input'

import type { Task } from '../types/task'

type CompleteTaskDialogProps = {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (actualTime?: number) => Promise<void>
}

export function CompleteTaskDialog({
  task,
  open,
  onOpenChange,
  onComplete,
}: CompleteTaskDialogProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const measured = Boolean(task.startedAt)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setError(null)
    const value = String(
      new FormData(event.currentTarget).get('actualTime') ?? '',
    )
    const actualTime = value === '' ? undefined : parseMinutes(value, 0)

    if (actualTime === null) {
      setError('Informe o tempo real em minutos inteiros, de 0 a 10080.')
      return
    }

    if (!measured && actualTime === undefined) {
      return
    }

    setSaving(true)
    try {
      await onComplete(actualTime)
      onOpenChange(false)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível concluir a tarefa. Tente novamente.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Concluir tarefa</DialogTitle>
          <DialogDescription>
            {measured
              ? 'Informe os minutos se quiser corrigir o tempo medido.'
              : 'Informe quantos minutos a tarefa levou.'}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor={`actual-${task.id}`}>Tempo real (min)</Label>
            <MinutesInput
              autoFocus
              id={`actual-${task.id}`}
              minimum={0}
              name="actualTime"
              required={!measured}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button disabled={saving} type="submit">
              {saving ? 'Salvando...' : 'Concluir tarefa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
