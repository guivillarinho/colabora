import { useMemo, useState } from 'react'

import { MutedText } from '@/components/typography'

import { sortTasks, type TaskSort } from '../sort-tasks'
import { useTasks } from '../tasks-context'
import { TaskCard } from './task-card'
import { TaskFilters } from './task-filters'

export function TaskBoard() {
  const { tasks, loading, removeTask, startTask, completeTask } = useTasks()
  const [sort, setSort] = useState<TaskSort>('dueDate')
  const [category, setCategory] = useState('')
  const categories = useMemo(
    () => [...new Set(tasks.map((task) => task.category))].sort(),
    [tasks],
  )
  const visibleTasks = sortTasks(
    category ? tasks.filter((task) => task.category === category) : tasks,
    sort,
  )

  if (loading) {
    return <MutedText>Carregando tarefas...</MutedText>
  }

  return (
    <div className="grid gap-4">
      <TaskFilters
        categories={categories}
        category={category}
        sort={sort}
        onCategoryChange={setCategory}
        onSortChange={setSort}
      />
      {visibleTasks.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhuma tarefa ainda. Use Criar tarefa para adicionar a primeira.
        </p>
      ) : (
        <ul className="grid gap-3">
          {visibleTasks.map((task) => (
            <li key={task.id}>
              <TaskCard
                task={task}
                onComplete={(actualTime) => completeTask(task.id, actualTime)}
                onDelete={() => {
                  return removeTask(task.id)
                }}
                onStart={() => {
                  startTask(task.id)
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
