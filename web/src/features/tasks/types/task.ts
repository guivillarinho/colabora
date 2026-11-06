import type { AuthAvatar } from '@/features/auth/auth-api'

export type Person = { id: string; name: string; avatar?: AuthAvatar | null }

export type TaskColor =
  'red' | 'blue' | 'yellow' | 'green' | 'purple' | 'orange'

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type TaskPriority = 'low' | 'medium' | 'high'

export type Task = {
  createdById: string | null
  assignedToId: string | null
  assignmentStatus?: 'pending' | 'accepted' | 'declined'
  createdBy: Person | null
  assignedTo: Person | null
  permissions: {
    edit: boolean
    assign: boolean
    delete: boolean
    changeStatus: boolean
  }
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
  actualTimeSource?: 'timer' | 'schedule' | 'estimate' | 'manual' | null
  status: TaskStatus
  startedAt: string | null
  completedAt?: string | null
  timed?: boolean
  createdAt: string
  updatedAt: string
}

export type TaskInput = {
  assignedToId?: string | null
  title: string
  description?: string
  category: string
  priority: TaskPriority
  color: TaskColor
  dueDate?: string | null
  location?: string
  attachments?: string[]
  estimatedTime: number
  startImmediately?: boolean
}

export type TaskCompletion = {
  task: Task
  productivityAdvice: string | null
}
