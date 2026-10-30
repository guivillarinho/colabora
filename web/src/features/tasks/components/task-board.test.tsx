import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import { ThemeProvider } from '@/app/theme-provider'
import { tasksApi } from '@/features/tasks/api/tasks-api'
import { TasksProvider } from '@/features/tasks/tasks-context'
import type { Task, TaskInput } from '@/features/tasks/types/task'

jest.mock('@/features/tasks/api/tasks-api', () => ({
  tasksApi: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    start: jest.fn(),
    complete: jest.fn(),
  },
}))

const api = tasksApi as jest.Mocked<typeof tasksApi>

function renderApp(initialSection: 'hoje' | 'timer' = 'timer') {
  return render(
    <ThemeProvider>
      <TasksProvider>
        <App initialSection={initialSection} />
      </TasksProvider>
    </ThemeProvider>,
  )
}

describe('TaskBoard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    api.list.mockResolvedValue([])
    api.create.mockImplementation(async (input: TaskInput) => buildTask(input))
  })

  it('keeps create task visible and hides advanced options', async () => {
    const user = userEvent.setup()

    renderApp()

    expect(
      screen.getAllByRole('button', { name: 'Criar tarefa' })[0],
    ).toBeVisible()

    await user.click(screen.getAllByRole('button', { name: 'Criar tarefa' })[0])

    expect(screen.getByLabelText('Título')).toBeVisible()
    expect(screen.queryByLabelText('Localização')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Opções avançadas' }))

    expect(screen.getByLabelText('Localização')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Escolher arquivo' }),
    ).toBeVisible()
  })

  it('marks the selected pastel color', async () => {
    const user = userEvent.setup()

    renderApp()

    await user.click(screen.getAllByRole('button', { name: 'Criar tarefa' })[0])
    await user.click(screen.getByRole('radio', { name: 'Trabalho' }))

    expect(screen.getByRole('radio', { name: 'Trabalho' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Pessoal' })).not.toBeChecked()
    expect(
      screen.getByRole('radio', { name: 'Trabalho' }).closest('label'),
    ).toHaveClass('bg-pastel-red')
  })

  it('shows the save failure inside the dialog', async () => {
    const user = userEvent.setup()

    api.create.mockRejectedValue(new Error('Não foi possível falar com a API.'))

    renderApp()

    await user.click(screen.getAllByRole('button', { name: 'Criar tarefa' })[0])
    await user.type(screen.getByLabelText('Título'), 'Comprar café')
    await user.click(screen.getByRole('button', { name: 'Salvar tarefa' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível falar com a API.',
    )
    expect(screen.getByRole('heading', { name: 'Nova tarefa' })).toBeVisible()
  })

  it('creates a task from the essential fields', async () => {
    const user = userEvent.setup()

    renderApp()

    await user.click(screen.getAllByRole('button', { name: 'Criar tarefa' })[0])
    await user.type(screen.getByLabelText('Título'), 'Comprar café')
    await user.click(screen.getByRole('button', { name: 'Salvar tarefa' }))

    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Comprar café' }),
    )
    expect(await screen.findByRole('heading', { name: 'Timer' })).toBeVisible()
  })

  it('creates a quick activity with its focus timer started', async () => {
    const user = userEvent.setup()

    renderApp()

    await user.click(screen.getAllByRole('button', { name: 'Criar tarefa' })[0])
    await user.click(screen.getByRole('button', { name: /Atividade rápida/ }))
    await user.type(screen.getByLabelText('Título'), 'Ler documentação')
    await user.click(screen.getByRole('button', { name: 'Salvar tarefa' }))

    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Ler documentação',
        startImmediately: true,
      }),
    )
    expect(api.create.mock.calls[0][0]).not.toHaveProperty('dueDate')
  })

  it('keeps quick activity creation focused on title, category and estimate', async () => {
    const user = userEvent.setup()

    renderApp()

    await user.click(screen.getAllByRole('button', { name: 'Criar tarefa' })[0])
    await user.click(screen.getByRole('button', { name: /Atividade rápida/ }))

    expect(screen.getByLabelText('Título')).toBeVisible()
    expect(screen.getByText('Categoria')).toBeVisible()
    expect(screen.getByLabelText('Tempo estimado (min)')).toBeVisible()
    expect(screen.queryByLabelText('Descrição')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Prioridade')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Opções avançadas' }),
    ).not.toBeInTheDocument()
  })
})

describe('App shell', () => {
  beforeEach(() => {
    api.list.mockResolvedValue([])
  })

  it('shows the day dashboard, navigation and pastel colors', async () => {
    renderApp('hoje')

    expect(await screen.findByRole('heading', { name: 'Hoje' })).toBeVisible()
    expect(
      screen.getByRole('progressbar', { name: 'Progresso das tarefas' }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Linha do tempo' }),
    ).toBeVisible()
    expect(screen.getByText('Olá, Guilherme')).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Cores' }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Timer' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Perfil' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: /tema/i })).toBeVisible()
  })
})

function buildTask(input: TaskInput): Task {
  return {
    id: 'task-1',
    title: input.title,
    description: input.description || null,
    category: input.category,
    priority: input.priority,
    color: input.color,
    dueDate: input.dueDate ?? null,
    location: input.location || null,
    attachments: input.attachments ?? [],
    estimatedTime: input.estimatedTime,
    actualTime: null,
    status: 'pending',
    startedAt: null,
    createdAt: '2026-10-29T12:00:00.000Z',
    updatedAt: '2026-10-29T12:00:00.000Z',
  }
}
