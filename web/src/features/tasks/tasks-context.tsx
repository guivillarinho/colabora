import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { tasksApi } from './api/tasks-api'
import type { Task, TaskInput } from './types/task'

type TasksContextValue = {
  tasks: Task[]
  loading: boolean
  error: string | null
  advice: string | null
  clearAdvice: () => void
  createTask: (input: TaskInput) => Promise<void>
  updateTask: (id: string, input: TaskInput) => Promise<void>
  removeTask: (id: string) => Promise<void>
  startTask: (id: string) => Promise<void>
  completeTask: (id: string, actualTime?: number) => Promise<void>
}

const TasksContext = createContext<TasksContextValue | null>(null)

type TasksProviderProps = {
  children: ReactNode
}

export function TasksProvider({ children }: TasksProviderProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [advice, setAdvice] = useState<string | null>(null)

  const replaceTask = useCallback((task: Task) => {
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? task : item)),
    )
  }, [])

  useEffect(() => {
    let active = true

    tasksApi
      .list()
      .then((data) => {
        if (active) {
          setTasks(data)
          setError(null)
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(errorMessage(cause))
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  const createTask = useCallback(async (input: TaskInput) => {
    try {
      const task = await tasksApi.create(input)
      setTasks((current) => [task, ...current])
      setError(null)
    } catch (cause) {
      const message = errorMessage(cause)
      setError(message)
      throw new Error(message)
    }
  }, [])

  const updateTask = useCallback(
    async (id: string, input: TaskInput) => {
      try {
        replaceTask(await tasksApi.update(id, input))
        setError(null)
      } catch (cause) {
        const message = errorMessage(cause)
        setError(message)
        throw new Error(message)
      }
    },
    [replaceTask],
  )

  const removeTask = useCallback(async (id: string) => {
    try {
      await tasksApi.remove(id)
      setTasks((current) => current.filter((task) => task.id !== id))
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }, [])

  const startTask = useCallback(
    async (id: string) => {
      try {
        replaceTask(await tasksApi.start(id))
        setError(null)
      } catch (cause) {
        setError(errorMessage(cause))
      }
    },
    [replaceTask],
  )

  const completeTask = useCallback(
    async (id: string, actualTime?: number) => {
      try {
        const result = await tasksApi.complete(id, actualTime)
        replaceTask(result.task)

        if (result.productivityAdvice) {
          setAdvice(result.productivityAdvice)
        }

        setError(null)
      } catch (cause) {
        setError(errorMessage(cause))
        throw cause
      }
    },
    [replaceTask],
  )

  const clearAdvice = useCallback(() => {
    setAdvice(null)
  }, [])

  const value = useMemo(
    () => ({
      tasks,
      loading,
      error,
      advice,
      clearAdvice,
      createTask,
      updateTask,
      removeTask,
      startTask,
      completeTask,
    }),
    [
      tasks,
      loading,
      error,
      advice,
      clearAdvice,
      createTask,
      updateTask,
      removeTask,
      startTask,
      completeTask,
    ],
  )

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
}

export function useTasks() {
  const context = useContext(TasksContext)

  if (!context) {
    throw new Error('useTasks precisa estar dentro de TasksProvider.')
  }

  return context
}

function errorMessage(cause: unknown): string {
  if (
    cause instanceof Error &&
    cause.message &&
    cause.message !== 'Failed to fetch'
  ) {
    return cause.message
  }

  return 'Não foi possível falar com a API.'
}
