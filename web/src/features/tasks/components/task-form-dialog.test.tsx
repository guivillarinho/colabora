import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAuthenticated as render, taskAccess } from '@/test/auth-fixture'
import { tasksApi } from '../api/tasks-api'
import { TasksProvider } from '../tasks-context'
import type { Task } from '../types/task'
import { TaskFormDialog } from './task-form-dialog'

jest.mock('../api/tasks-api', () => ({
  tasksApi: { list: jest.fn(), create: jest.fn(), update: jest.fn() },
}))
const api = tasksApi as jest.Mocked<typeof tasksApi>

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers({ now: new Date(2026, 10, 4, 8) })
  api.list.mockResolvedValue([])
  api.create.mockResolvedValue({ ...taskAccess, id: 'new-task' } as Task)
})

afterEach(() => jest.useRealTimers())

async function renderForm(task?: Task) {
  const view = render(
    <TasksProvider>
      <TaskFormDialog open task={task} onOpenChange={() => undefined} />
    </TasksProvider>,
  )
  await act(async () => {
    await Promise.resolve()
  })
  return view
}

it('fills the date while typing and saves the recognized local time', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  await renderForm()
  await user.type(screen.getByLabelText('Título'), 'Enviar proposta às 9h30')
  expect(screen.getByLabelText('Data e hora')).toHaveValue('2026-11-04T09:30')
  expect(screen.getByRole('status')).toHaveTextContent('Horário reconhecido:')
  await user.click(screen.getByRole('button', { name: 'Salvar tarefa' }))
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Enviar proposta às 9h30',
        dueDate: new Date(2026, 10, 4, 9, 30).toISOString(),
      }),
    ),
  )
})

it('updates and removes the automatic schedule as the title changes', async () => {
  await renderForm()
  const title = screen.getByLabelText('Título')
  fireEvent.change(title, { target: { value: 'Consulta 9h' } })
  expect(screen.getByLabelText('Data e hora')).toHaveValue('2026-11-04T09:00')
  fireEvent.change(title, { target: { value: 'Consulta 10h' } })
  expect(screen.getByLabelText('Data e hora')).toHaveValue('2026-11-04T10:00')
  fireEvent.change(title, { target: { value: 'Consulta' } })
  expect(screen.getByLabelText('Data e hora')).toHaveValue('')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('keeps a manually selected schedule when the title changes', async () => {
  await renderForm()
  fireEvent.change(screen.getByLabelText('Título'), {
    target: { value: 'Consulta 9h' },
  })
  fireEvent.change(screen.getByLabelText('Data e hora'), {
    target: { value: '2026-11-07T15:00' },
  })
  fireEvent.change(screen.getByLabelText('Título'), {
    target: { value: 'Consulta 10h' },
  })
  expect(screen.getByLabelText('Data e hora')).toHaveValue('2026-11-07T15:00')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('keeps an existing task schedule when editing its title', async () => {
  await renderForm({
    ...taskAccess,
    id: 'task',
    title: 'Consulta',
    category: 'Pessoal',
    dueDate: new Date(2026, 10, 7, 15).toISOString(),
    attachments: [],
    estimatedTime: 60,
  } as Task)
  fireEvent.change(screen.getByLabelText('Título'), {
    target: { value: 'Consulta 9h' },
  })
  expect(screen.getByLabelText('Data e hora')).toHaveValue('2026-11-07T15:00')
})

it('starts a quick activity without scheduling it from its title', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  await renderForm()
  await user.click(screen.getByRole('button', { name: /Atividade rápida/ }))
  await user.type(screen.getByLabelText('Título'), 'Revisão 9h')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Salvar tarefa' }))
  await waitFor(() => expect(api.create).toHaveBeenCalled())
  expect(api.create.mock.calls[0][0]).toMatchObject({ startImmediately: true })
  expect(api.create.mock.calls[0][0]).not.toHaveProperty('dueDate')
})

it('loads the latest saved title and date when an updated task is reopened', async () => {
  const original = {
    ...taskAccess,
    id: 'task',
    title: 'Consulta',
    category: 'Pessoal',
    dueDate: new Date(2026, 10, 7, 15).toISOString(),
    attachments: [],
    estimatedTime: 60,
    updatedAt: '2026-11-04T08:00:00.000Z',
  } as Task
  const view = (task: Task, open: boolean) => (
    <TasksProvider>
      <TaskFormDialog open={open} task={task} onOpenChange={() => undefined} />
    </TasksProvider>
  )
  const { rerender } = render(view(original, true))
  await act(async () => {
    await Promise.resolve()
  })
  fireEvent.change(screen.getByLabelText('Título'), {
    target: { value: 'Consulta alterada' },
  })
  rerender(view(original, false))
  const updated = {
    ...original,
    title: 'Consulta salva',
    dueDate: new Date(2026, 10, 8, 16).toISOString(),
    updatedAt: '2026-11-04T08:01:00.000Z',
  }
  rerender(view(updated, true))
  expect(screen.getByLabelText('Título')).toHaveValue('Consulta salva')
  expect(screen.getByLabelText('Data e hora')).toHaveValue('2026-11-08T16:00')
})
