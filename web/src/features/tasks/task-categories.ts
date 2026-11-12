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

const dynamicColors: TaskColor[] = [
  'blue',
  'yellow',
  'purple',
  'green',
  'orange',
  'red',
]

export function categoryByName(
  name: string | null | undefined,
  knownCategories?: TaskCategory[],
): TaskCategory {
  const trimmed = name?.trim()
  if (!trimmed) return taskCategories[0]

  const list = knownCategories?.length ? knownCategories : taskCategories
  const found = list.find(
    (category) => category.name.toLowerCase() === trimmed.toLowerCase(),
  )
  if (found) return found

  const defaultFound = taskCategories.find(
    (category) => category.name.toLowerCase() === trimmed.toLowerCase(),
  )
  if (defaultFound) return defaultFound

  let hash = 0
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash + trimmed.charCodeAt(i)) % dynamicColors.length
  }
  return { name: trimmed, color: dynamicColors[hash] }
}
