import { fireEvent, screen, waitFor } from '@testing-library/react'

import {
  renderAuthenticated as render,
  taskAccess,
  testUser,
} from '@/test/auth-fixture'
import { apiBase } from '@/lib/http-client'
import type { Task } from '../types/task'
import { TaskAssigneeBadge } from './task-assignee-badge'

const task = {
  ...taskAccess,
  id: 'shared-task',
  assignedTo: { id: 'other-user', name: 'Ana Silva', avatar: null },
} as Task

beforeEach(() => {
  globalThis.fetch = jest.fn()
  URL.createObjectURL = jest.fn(() => 'blob:assignee')
  URL.revokeObjectURL = jest.fn()
})

it('identifies the assignee rather than the creator and handles no assignee', () => {
  const { rerender } = render(<TaskAssigneeBadge task={task} />)
  expect(
    screen.getByRole('img', { name: 'Responsável: Ana Silva' }),
  ).toHaveTextContent('AS')
  expect(screen.queryByText(testUser.name)).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
  rerender(<TaskAssigneeBadge task={{ ...task, assignedTo: null }} />)
  expect(screen.getByText('Sem responsável')).toBeVisible()
  expect(screen.queryByText('AS')).not.toBeInTheDocument()
})

it('uses the preset saved by the assigned user', () => {
  render(
    <TaskAssigneeBadge
      task={{
        ...task,
        assignedTo: {
          ...task.assignedTo!,
          avatar: { kind: 'preset', id: 'leaf' },
        },
      }}
    />,
  )
  expect(
    screen
      .getByRole('img', { name: 'Responsável: Ana Silva' })
      .querySelector('svg'),
  ).not.toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})

it('loads the photo through the private task route and releases it on reassignment', async () => {
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    blob: async () => new Blob(['photo']),
  } as Response)
  const { rerender } = render(
    <TaskAssigneeBadge
      task={{
        ...task,
        assignedTo: {
          ...task.assignedTo!,
          avatar: { kind: 'image', revision: 'photo-v1' },
        },
      }}
    />,
  )
  await waitFor(() =>
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      'blob:assignee',
    ),
  )
  expect(fetch).toHaveBeenCalledWith(
    `${apiBase}/tasks/shared-task/assignee/avatar`,
    expect.objectContaining({
      credentials: 'include',
      cache: 'no-store',
      headers: { 'X-Session-User': testUser.id },
    }),
  )
  fireEvent.error(document.querySelector('img')!)
  expect(
    screen.getByRole('img', { name: 'Responsável: Ana Silva' }),
  ).toHaveTextContent('AS')
  rerender(<TaskAssigneeBadge task={{ ...task, assignedTo: null }} />)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:assignee')
  expect(screen.queryByText('AS')).not.toBeInTheDocument()
})

it('keeps initials when the private photo cannot be loaded', async () => {
  jest.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response)
  render(
    <TaskAssigneeBadge
      task={{
        ...task,
        assignedTo: {
          ...task.assignedTo!,
          avatar: { kind: 'image', revision: 'missing' },
        },
      }}
    />,
  )
  await waitFor(() => expect(fetch).toHaveBeenCalled())
  expect(
    screen.getByRole('img', { name: 'Responsável: Ana Silva' }),
  ).toHaveTextContent('AS')
  expect(document.querySelector('img')).toBeNull()
})
