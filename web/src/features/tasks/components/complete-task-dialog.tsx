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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  const measured = Boolean(task.startedAt)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = String(
      new FormData(event.currentTarget).get('actualTime') ?? '',
    )
    const actualTime = value === '' ? undefined : Number(value)

    if (!measured && actualTime === undefined) {
      return
    }

    setSaving(true)
    try {
      await onComplete(actualTime)
      onOpenChange(false)
    } catch {
      // The task context keeps the API error available to the page.
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
            <Input
              autoFocus
              id={`actual-${task.id}`}
              min={0}
              name="actualTime"
              required={!measured}
              type="number"
            />
          </div>
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
