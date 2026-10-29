export type TaskColor =
  'red' | 'blue' | 'yellow' | 'green' | 'purple' | 'orange'

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type TaskPriority = 'low' | 'medium' | 'high'

export type Task = {
  id: string
  title: string
  description: string | null
  category: string
  priority: TaskPriority
  color: TaskColor
  dueDate: string | null
  location: string | null
  attachments: string[]
  estimatedTime: number
  actualTime: number | null
  status: TaskStatus
  startedAt: string | null
  createdAt: string
  updatedAt: string
}

export type TaskInput = {
  title: string
  description?: string
  category: string
  priority: TaskPriority
  color: TaskColor
  dueDate?: string
  location?: string
  attachments?: string[]
  estimatedTime: number
}

export type TaskCompletion = {
  task: Task
  productivityAdvice: string | null
}
