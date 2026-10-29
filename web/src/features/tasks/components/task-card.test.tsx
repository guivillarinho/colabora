import { render, screen } from '@testing-library/react'

import { tasksApi } from '@/features/tasks/api/tasks-api'
import { TasksProvider } from '@/features/tasks/tasks-context'

import { TaskCard } from './task-card'
import type { Task } from '../types/task'

jest.mock('@/features/tasks/api/tasks-api', () => ({
  tasksApi: {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    start: jest.fn(),
    complete: jest.fn(),
  },
}))

describe('TaskCard', () => {
  beforeEach(() => {
    jest.mocked(tasksApi.list).mockResolvedValue([])
  })

  it('renders the pastel color that belongs to the task', () => {
    const { rerender } = render(
      <TasksProvider>
        <TaskCard
          task={sampleTask('red')}
          onComplete={async () => undefined}
          onDelete={() => undefined}
          onStart={() => undefined}
        />
      </TasksProvider>,
    )

    expect(screen.getByRole('article')).toHaveClass('bg-pastel-red')
    expect(screen.getByRole('article')).not.toHaveClass('bg-pastel-blue')

    rerender(
      <TasksProvider>
        <TaskCard
          task={sampleTask('blue')}
          onComplete={async () => undefined}
          onDelete={() => undefined}
          onStart={() => undefined}
        />
      </TasksProvider>,
    )

    expect(screen.getByRole('article')).toHaveClass('bg-pastel-blue')
    expect(screen.getByRole('article')).not.toHaveClass('bg-pastel-red')
  })
})

function sampleTask(color: Task['color']): Task {
  return {
    id: 'task-1',
    title: 'Estudar',
    description: null,
    category: 'Estudos',
    priority: 'medium',
    color,
    dueDate: null,
    location: null,
    attachments: [],
    estimatedTime: 60,
    actualTime: null,
    status: 'pending',
    startedAt: null,
    createdAt: '2026-10-29T12:00:00.000Z',
    updatedAt: '2026-10-29T12:00:00.000Z',
  }
}
