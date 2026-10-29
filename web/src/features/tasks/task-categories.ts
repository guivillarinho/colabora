import type { TaskColor } from './types/task'

export type TaskCategory = {
  name: string
  color: TaskColor
}

export const taskCategories: TaskCategory[] = [
  { name: 'Pessoal', color: 'blue' },
  { name: 'Trabalho', color: 'red' },
  { name: 'Estudos', color: 'yellow' },
  { name: 'Saúde', color: 'green' },
  { name: 'Casa', color: 'purple' },
  { name: 'Compras', color: 'orange' },
]

export function categoryByName(name: string | null | undefined): TaskCategory {
  return (
    taskCategories.find((category) => category.name === name) ??
    taskCategories[0]
  )
}
