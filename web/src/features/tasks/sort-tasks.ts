import type { Task, TaskPriority } from './types/task'

export type TaskSort = 'dueDate' | 'priority' | 'category'

const priorityRank: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  return [...tasks].sort((left, right) => {
    if (sort === 'priority') {
      return priorityRank[left.priority] - priorityRank[right.priority]
    }

    if (sort === 'category') {
      return left.category.localeCompare(right.category, 'pt-BR')
    }

    const leftTime = left.dueDate
      ? new Date(left.dueDate).getTime()
      : Number.POSITIVE_INFINITY
    const rightTime = right.dueDate
      ? new Date(right.dueDate).getTime()
      : Number.POSITIVE_INFINITY

    return leftTime - rightTime
  })
}
