import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAuthenticated, taskAccess } from '@/test/auth-fixture'
import { tasksApi } from '../api/tasks-api'
import { TasksProvider, useTasks } from '../tasks-context'
import type { Task } from '../types/task'
import { TaskFormDialog } from './task-form-dialog'
import { TaskCard } from './task-card'
import { TaskAssignment } from './task-assignment'
import { TaskTimeline } from '@/features/dashboard/components/task-timeline'
import { AssigneeField } from './assignee-field'

jest.mock('../api/tasks-api', () => ({
  tasksApi: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    respondAssignment: jest.fn(),
  },
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
  await user.type(
    screen.getByLabelText('Responsável'),
    'recipient@example.test',
  )
  await user.click(await screen.findByRole('button', { name: 'Destinatário' }))
  await user.click(screen.getByRole('button', { name: /Salvar tarefa/ }))
  expect(api.create).toHaveBeenCalledWith(
    expect.objectContaining({ assignedToId: 'recipient', title: 'Delegada' }),
  )
  expect(api.create.mock.calls[0][0]).not.toHaveProperty('createdById')
})
it('hides edit and delete controls for the assignee but keeps completion available', async () => {
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
  await act(async () => undefined)
  expect(
    screen.queryByRole('button', { name: 'Editar' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Excluir' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Concluir' })).toBeVisible()
})

function AssignmentFixture() {
  const { tasks } = useTasks()
  return (
    <>
      {tasks.map((task) => (
        <TaskAssignment key={task.id} task={task} />
      ))}
    </>
  )
}

it.each(['accepted', 'declined'] as const)(
  'submits %s and updates the invitation',
  async (response) => {
    const task = {
      ...taskAccess,
      id: 'invitation',
      title: 'Convite',
      assignmentStatus: 'pending',
      createdBy: { id: 'owner', name: 'Criador' },
      permissions: {
        edit: false,
        assign: false,
        delete: false,
        changeStatus: false,
      },
    } as Task
    api.list.mockResolvedValue([task])
    api.respondAssignment.mockResolvedValue({
      ...task,
      assignmentStatus: response,
    })
    renderAuthenticated(
      <TasksProvider>
        <AssignmentFixture />
      </TasksProvider>,
    )
    await userEvent.click(
      await screen.findByRole('button', {
        name: response === 'accepted' ? 'Aceitar tarefa' : 'Recusar tarefa',
      }),
    )
    expect(api.respondAssignment).toHaveBeenCalledWith('invitation', response)
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Aceitar tarefa' }),
      ).not.toBeInTheDocument(),
    )
  },
)

it('keeps the invitation actionable after an API failure', async () => {
  const task = {
    ...taskAccess,
    id: 'invitation',
    assignmentStatus: 'pending',
    permissions: {
      ...taskAccess.permissions,
      edit: false,
      changeStatus: false,
    },
  } as Task
  api.list.mockResolvedValue([task])
  api.respondAssignment.mockRejectedValue(new Error('Tente novamente.'))
  renderAuthenticated(
    <TasksProvider>
      <AssignmentFixture />
    </TasksProvider>,
  )
  await userEvent.click(
    await screen.findByRole('button', { name: 'Aceitar tarefa' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('Tente novamente.')
  expect(screen.getByRole('button', { name: 'Recusar tarefa' })).toBeEnabled()
})

it('shows the incoming request on the timeline and blocks completion before acceptance', async () => {
  const task = {
    ...taskAccess,
    id: 'incoming',
    title: 'Tarefa recebida',
    assignmentStatus: 'pending',
    category: 'Pessoal',
    color: 'blue',
    status: 'pending',
    estimatedTime: 30,
    attachments: [],
    dueDate: null,
    startedAt: null,
    createdBy: { id: 'owner', name: 'Criador' },
    permissions: {
      edit: false,
      assign: false,
      delete: false,
      changeStatus: false,
    },
  } as Task
  renderAuthenticated(
    <TasksProvider>
      <TaskTimeline
        tasks={[task]}
        onComplete={jest.fn()}
        onDelete={jest.fn()}
      />
    </TasksProvider>,
  )
  await act(async () => undefined)
  expect(screen.getByRole('heading', { name: 'Tarefa recebida' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Aceitar tarefa' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Recusar tarefa' })).toBeVisible()
  expect(
    screen.queryByRole('button', { name: /Concluir tarefa/ }),
  ).not.toBeInTheDocument()
})

it('searches only a complete email and reports when the account does not exist', async () => {
  const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] })
  globalThis.fetch = fetch
  renderAuthenticated(<AssigneeField value={null} onChange={jest.fn()} />)
  const input = screen.getByLabelText('Responsável')
  await userEvent.type(input, 'Pessoa')
  expect(fetch).not.toHaveBeenCalled()
  await userEvent.clear(input)
  await userEvent.type(input, 'missing@example.test')
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Nenhum usuário cadastrado com este e-mail.',
  )
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/users?query=missing%40example.test'),
    expect.anything(),
  )
})
