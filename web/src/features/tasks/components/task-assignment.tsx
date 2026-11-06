import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { tasksApi } from '../api/tasks-api'
import { useTasks } from '../tasks-context'
import type { Task } from '../types/task'

export function TaskAssignment({ task }: { task: Task }) {
  if (task.assignmentStatus !== 'pending' || task.permissions.edit) return null
  return <AssignmentResponse task={task} />
}

function AssignmentResponse({ task }: { task: Task }) {
  const { acceptTask } = useTasks()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function respond(response: 'accepted' | 'declined') {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      acceptTask(await tasksApi.respondAssignment(task.id, response))
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível responder.',
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="grid gap-2 border-t border-border/60 pt-3">
      <div className="grid grid-cols-2 items-stretch gap-2">
        <Button
          className="h-10 w-full px-2 text-sm"
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => {
            respond('accepted').catch(() => undefined)
          }}
        >
          Aceitar tarefa
        </Button>
        <Button
          className="h-10 w-full px-2 text-sm"
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => {
            respond('declined').catch(() => undefined)
          }}
        >
          Recusar tarefa
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
