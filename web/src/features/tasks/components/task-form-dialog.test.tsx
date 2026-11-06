import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  renderAuthenticated as render,
  taskAccess,
  testUser,
} from '@/test/auth-fixture'
import { uploadAgendaFiles } from '@/features/dashboard/upload-agenda-files'
import { tasksApi } from '../api/tasks-api'
import { TasksProvider } from '../tasks-context'
import type { Task } from '../types/task'
import { TaskFormDialog } from './task-form-dialog'

jest.mock('@/features/dashboard/upload-agenda-files', () => ({
  uploadAgendaFiles: jest.fn(),
}))

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
  await user.click(screen.getByRole('button', { name: /Tarefa cronometrada/ }))
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

const uploadedUrl = '/uploads/agenda/12345678-1234-1234-1234-123456789abc.pdf'

function savedTask(attachments: string[]): Task {
  return {
    ...taskAccess,
    id: 'task',
    title: 'Consulta',
    description: '',
    category: 'Pessoal',
    priority: 'medium',
    color: 'blue',
    dueDate: null,
    location: '',
    attachments,
    estimatedTime: 60,
    actualTime: null,
    status: 'pending',
    startedAt: null,
    createdAt: '2026-11-04T08:00:00.000Z',
    updatedAt: '2026-11-04T08:00:00.000Z',
  }
}

it('saves an uploaded task file as name and recoverable url', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  jest
    .mocked(uploadAgendaFiles)
    .mockResolvedValue([{ name: 'proposta.pdf', url: uploadedUrl }])
  await renderForm()
  await user.type(screen.getByLabelText('Título'), 'Enviar proposta')
  await user.click(screen.getByRole('button', { name: 'Opções avançadas' }))
  const file = new File(['%PDF'], 'proposta.pdf', { type: 'application/pdf' })
  await user.upload(screen.getByLabelText('Anexos'), file)
  expect(await screen.findByText('proposta.pdf')).toBeInTheDocument()
  expect(uploadAgendaFiles).toHaveBeenCalledWith([file], testUser.id)
  await user.click(screen.getByRole('button', { name: 'Salvar tarefa' }))
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [`proposta.pdf||${uploadedUrl}`],
      }),
    ),
  )
})

it('does not save a filename when the upload fails', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  jest
    .mocked(uploadAgendaFiles)
    .mockRejectedValue(new Error('Cada arquivo deve ter no máximo 10 MB.'))
  await renderForm()
  await user.type(screen.getByLabelText('Título'), 'Sem arquivo')
  await user.click(screen.getByRole('button', { name: 'Opções avançadas' }))
  await user.upload(
    screen.getByLabelText('Anexos'),
    new File(['x'], 'grande.pdf', { type: 'application/pdf' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('10 MB')
  await user.click(screen.getByRole('button', { name: 'Salvar tarefa' }))
  await waitFor(() => expect(api.create).toHaveBeenCalled())
  expect(api.create.mock.calls.at(-1)?.[0].attachments).toEqual([])
})

it('does not keep a bare filename as a task attachment', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  api.update.mockResolvedValue(savedTask([]))
  await renderForm(savedTask(['somente-nome.pdf']))
  expect(screen.queryByText('somente-nome.pdf')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Salvar tarefa' }))
  await waitFor(() =>
    expect(api.update).toHaveBeenCalledWith(
      'task',
      expect.objectContaining({ attachments: [] }),
    ),
  )
})

it('keeps an already uploaded attachment reference when editing', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  const reference = `proposta.pdf||${uploadedUrl}`
  api.update.mockResolvedValue(savedTask([reference]))
  await renderForm(savedTask([reference]))
  await user.click(screen.getByRole('button', { name: 'Opções avançadas' }))
  expect(screen.getByText('proposta.pdf')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Salvar tarefa' }))
  await waitFor(() =>
    expect(api.update).toHaveBeenCalledWith(
      'task',
      expect.objectContaining({ attachments: [reference] }),
    ),
  )
})

it('clears a saved due date when the field is emptied', async () => {
  api.update.mockResolvedValue({ ...taskAccess, dueDate: null } as Task)
  await renderForm({
    ...taskAccess,
    id: 'task',
    title: 'Consulta',
    category: 'Pessoal',
    dueDate: new Date(2026, 10, 7, 15).toISOString(),
    attachments: [],
    estimatedTime: 60,
  } as Task)
  fireEvent.change(screen.getByLabelText('Data e hora'), {
    target: { value: '' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar tarefa' }))
  await waitFor(() =>
    expect(api.update).toHaveBeenCalledWith(
      'task',
      expect.objectContaining({ dueDate: null }),
    ),
  )
})

it('shows a notebook and a stopwatch on the creation modes', async () => {
  await renderForm()
  expect(
    screen
      .getByRole('button', { name: 'Tarefa agendada' })
      .querySelector('svg'),
  ).not.toBeNull()
  expect(
    screen
      .getByRole('button', { name: 'Tarefa cronometrada' })
      .querySelector('svg'),
  ).not.toBeNull()
})
