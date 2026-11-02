import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAuthenticated, taskAccess } from '@/test/auth-fixture'
import { tasksApi } from '../api/tasks-api'
import { TasksProvider } from '../tasks-context'
import type { Task } from '../types/task'
import { TaskFormDialog } from './task-form-dialog'
import { TaskCard } from './task-card'

jest.mock('../api/tasks-api', () => ({
  tasksApi: { list: jest.fn(), create: jest.fn(), update: jest.fn() },
}))
const api = tasksApi as jest.Mocked<typeof tasksApi>
beforeEach(() => {
  jest.resetAllMocks()
  api.list.mockResolvedValue([])
})
it('assigns a new task to a selected user without supplying the creator identity', async () => {
  const user = userEvent.setup()
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ id: 'recipient', name: 'Destinatário' }],
  })
  api.create.mockResolvedValue({
    ...taskAccess,
    id: 'task',
    title: 'Delegada',
  } as Task)
  renderAuthenticated(
    <TasksProvider>
      <TaskFormDialog open onOpenChange={() => undefined} />
    </TasksProvider>,
  )
  await user.type(screen.getByLabelText('Título'), 'Delegada')
  await user.type(screen.getByLabelText('Responsável'), 'Desti')
  await user.click(await screen.findByRole('button', { name: 'Destinatário' }))
  await user.click(screen.getByRole('button', { name: /Salvar tarefa/ }))
  expect(api.create).toHaveBeenCalledWith(
    expect.objectContaining({ assignedToId: 'recipient', title: 'Delegada' }),
  )
  expect(api.create.mock.calls[0][0]).not.toHaveProperty('createdById')
})
it('hides edit and delete controls for the assignee but keeps completion available', () => {
  const task = {
    ...taskAccess,
    id: 'assigned',
    title: 'Compartilhada',
    category: 'Pessoal',
    color: 'blue',
    priority: 'medium',
    status: 'pending',
    estimatedTime: 30,
    attachments: [],
    permissions: {
      edit: false,
      delete: false,
      assign: false,
      changeStatus: true,
    },
  } as Task
  renderAuthenticated(
    <TasksProvider>
      <TaskCard
        task={task}
        onStart={() => undefined}
        onComplete={async () => undefined}
        onDelete={() => undefined}
      />
    </TasksProvider>,
  )
  expect(
    screen.queryByRole('button', { name: 'Editar' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Excluir' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Concluir' })).toBeVisible()
})
