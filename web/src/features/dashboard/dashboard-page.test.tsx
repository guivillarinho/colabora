import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAuthenticated } from '@/test/auth-fixture'
import { listAgendaItems, type AgendaItem } from './agenda-items'
import { DashboardPage } from './dashboard-page'
import { TaskExecutionChart } from './components/task-execution-chart'
import type { Task } from '@/features/tasks/types/task'

jest.mock('@/features/google/google-api', () => ({
  googleStatus: jest.fn().mockResolvedValue({
    configured: false,
    status: 'disconnected',
  }),
  googleSyncNow: jest.fn(),
}))
const mockTasksState = {
  tasks: [] as Task[],
  loading: false,
  completeTask: jest.fn(),
  removeTask: jest.fn(),
}
jest.mock('@/features/tasks/tasks-context', () => ({
  useTasks: () => mockTasksState,
}))
const mockGoTo = jest.fn()
jest.mock('@/components/layout/navigation', () => ({
  useNavigation: () => ({ goTo: mockGoTo }),
}))
jest.mock('./agenda-items', () => ({
  ...jest.requireActual('./agenda-items'),
  listAgendaItems: jest.fn(),
}))
const listItems = jest.mocked(listAgendaItems)

beforeEach(() => {
  mockGoTo.mockClear()
  mockTasksState.loading = false
  mockTasksState.tasks = []
  listItems.mockResolvedValue([])
})
jest.mock('./components/active-timer', () => ({ ActiveTimer: () => null }))
jest.mock('./components/task-timeline', () => ({
  ...jest.requireActual('./components/task-timeline'),
  TaskTimeline: ({ loading }: { loading?: boolean }) =>
    loading ? (
      <p aria-label="Carregando tarefas" role="status">
        Carregando tarefas
      </p>
    ) : null,
}))
jest.mock('@/features/timer/focus-sessions-api', () => ({
  focusSessionsApi: { list: jest.fn() },
}))

it('shows event and task placeholders while Hoje is loading', () => {
  mockTasksState.loading = true
  listItems.mockReturnValue(new Promise(() => undefined))
  render(<DashboardPage />)
  const events = screen.getByRole('status', {
    name: 'Carregando eventos e projetos',
  })
  expect(events.querySelectorAll('li')).toHaveLength(3)
  expect(
    events.querySelectorAll('[data-slot="skeleton"]').length,
  ).toBeGreaterThan(0)
  expect(
    screen.getByRole('status', { name: 'Carregando tarefas' }),
  ).toBeVisible()
  expect(
    screen.queryByText('Nenhum evento ou projeto agendado para hoje.'),
  ).not.toBeInTheDocument()
})

it('keeps focus sessions and achievements out of Hoje', async () => {
  render(<DashboardPage />)
  expect(screen.getByRole('heading', { name: 'Hoje' })).toBeVisible()
  expect(screen.queryByText('Dashboard de foco')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Conquistas de foco')).not.toBeInTheDocument()
  expect(screen.queryByText('Sessões recentes')).not.toBeInTheDocument()
  expect(screen.queryByText('Tempo por categoria')).not.toBeInTheDocument()
  expect(
    await screen.findByText('Nenhum evento ou projeto agendado para hoje.'),
  ).toBeVisible()
})

it('aggregates completed task durations by category without counting unfinished tasks', () => {
  const tasks = [
    { category: 'Trabalho', status: 'completed', actualTime: 40 },
    { category: 'Trabalho', status: 'completed', actualTime: 35 },
    { category: 'Estudo', status: 'completed', actualTime: 15 },
    { category: 'Estudo', status: 'pending', actualTime: 100 },
    { category: 'Sem tempo', status: 'completed', actualTime: null },
  ] as Task[]
  render(<TaskExecutionChart tasks={tasks} />)
  expect(screen.getByText('1 h 30 min')).toBeVisible()
  expect(screen.getByText('1 h 15 min')).toBeVisible()
  expect(screen.getByText('15 min')).toBeVisible()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.queryByText('Sem tempo')).not.toBeInTheDocument()
})

it('previews up to three agenda entries overlapping today and opens the agenda', async () => {
  function time(dayOffset: number, hour: number) {
    const date = new Date()
    date.setDate(date.getDate() + dayOffset)
    date.setHours(hour, 0, 0, 0)
    return date.toISOString()
  }

  function entry(
    title: string,
    type: AgendaItem['type'],
    startDate: string,
    endDate = startDate,
  ): AgendaItem {
    return {
      id: title,
      title,
      type,
      startDate,
      endDate,
      description: 'Descrição completa',
      location: null,
      attachments: [],
      icon: null,
    }
  }

  listItems.mockResolvedValue([
    entry('Evento de ontem', 'event', time(-1, 8)),
    entry('Projeto em andamento', 'project', time(-1, 10), time(1, 10)),
    entry('Reunião', 'event', time(0, 9)),
    entry('Planejamento', 'project', time(0, 10)),
    entry('Quarto item de hoje', 'event', time(0, 11)),
    entry('Evento de amanhã', 'event', time(1, 9)),
  ])

  renderAuthenticated(<DashboardPage />)
  expect(await screen.findByText('Projeto em andamento')).toBeVisible()
  expect(screen.getByText('Reunião')).toBeVisible()
  expect(screen.getByText('Planejamento')).toBeVisible()
  expect(screen.getAllByRole('listitem')).toHaveLength(3)
  expect(screen.queryByText('Evento de ontem')).not.toBeInTheDocument()
  expect(screen.queryByText('Evento de amanhã')).not.toBeInTheDocument()
  expect(screen.queryByText('Quarto item de hoje')).not.toBeInTheDocument()
  expect(screen.queryByText('Descrição completa')).not.toBeInTheDocument()
  const user = userEvent.setup()
  for (const name of [/Reunião/, /Projeto em andamento/]) {
    const card = screen.getByRole('button', { name })
    await user.click(card)
    const details = screen.getByRole('dialog', { name })
    expect(within(details).getByText('Descrição completa')).toBeVisible()
    expect(within(details).getByText('Início')).toBeVisible()
    expect(within(details).getByText('Final')).toBeVisible()
    expect(
      within(details).getByRole('button', { name: 'Escolher arquivo' }),
    ).toBeEnabled()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(card).toHaveFocus()
  }
  const eventCard = screen.getByRole('button', { name: /Reunião/ })
  fireEvent(
    eventCard,
    new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 520))
  })
  fireEvent.pointerUp(eventCard)
  fireEvent.click(eventCard, { detail: 1 })
  expect(eventCard).toHaveAttribute('aria-checked', 'true')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(
    screen.getByRole('checkbox', { name: /Projeto em andamento/ }),
  )
  expect(screen.getByText('2 selecionado(s)')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Excluir selecionados' }))
  expect(
    screen.getByRole('dialog', { name: 'Excluir itens selecionados?' }),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: /^Cancelar$/ }))
  await user.click(screen.getByRole('button', { name: 'Cancelar seleção' }))
  expect(eventCard).not.toHaveAttribute('aria-checked')

  fireEvent.click(
    screen.getByRole('button', { name: 'Ver tudo na agenda de hoje' }),
  )
  expect(mockGoTo).toHaveBeenCalledWith('agenda')
})
