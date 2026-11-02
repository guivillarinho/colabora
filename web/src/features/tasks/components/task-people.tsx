import type { Task } from '../types/task'
export function TaskPeople({ task }: { task: Task }) {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      Criada por {task.createdBy?.name ?? 'Usuário'} · Responsável:{' '}
      {task.assignedTo?.name ?? 'não atribuído'}
    </p>
  )
}
