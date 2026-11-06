import { render, screen } from '@testing-library/react'

import { taskAccess } from '@/test/auth-fixture'

import type { Task } from '../types/task'
import { TaskExecutionTime } from './task-execution-time'

function completed(overrides: Partial<Task>): Task {
  return {
    ...taskAccess,
    id: 'task-1',
    title: 'Reunião',
    description: null,
    category: 'Trabalho',
    priority: 'medium',
    color: 'blue',
    dueDate: '2026-11-06T20:00:00.000Z',
    location: null,
    attachments: [],
    estimatedTime: 60,
    actualTime: 20 * 60 + 55,
    actualTimeSource: 'schedule',
    status: 'completed',
    startedAt: null,
    completedAt: null,
    createdAt: '2026-11-06T12:00:00.000Z',
    updatedAt: '2026-11-06T12:00:00.000Z',
    ...overrides,
  }
}

it('does not show 20 h 55 min when the recorded start and end are 17:00 the same day', () => {
  render(
    <TaskExecutionTime
      task={completed({
        startedAt: '2026-11-06T20:00:00.000Z',
        completedAt: '2026-11-06T20:00:00.000Z',
        dueDate: '2026-11-06T20:00:00.000Z',
      })}
    />,
  )
  expect(screen.getByText('0 min')).toBeVisible()
  expect(screen.queryByText('20 h 55 min')).not.toBeInTheDocument()
})

it('uses the planned duration when a date-only schedule was measured from UTC midnight', () => {
  render(
    <TaskExecutionTime
      task={completed({
        dueDate: '2026-11-06T00:00:00.000Z',
        actualTimeSource: 'schedule',
        estimatedTime: 60,
      })}
    />,
  )
  expect(
    screen.getByRole('region', { name: 'Tempo estimado de execução' }),
  ).toBeVisible()
  expect(screen.getByText('1 h')).toBeVisible()
  expect(
    screen.getByText('Duração prevista · sem início registrado'),
  ).toBeVisible()
  expect(screen.queryByText('20 h 55 min')).not.toBeInTheDocument()
  expect(screen.queryByText('Desde o horário agendado')).not.toBeInTheDocument()
})
