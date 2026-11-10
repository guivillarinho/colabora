import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { listAgendaItems, type AgendaItem } from './agenda-items'
import { DashboardPage } from './dashboard-page'
import { TaskExecutionChart } from './components/task-execution-chart'
import type { Task } from '@/features/tasks/types/task'

jest.mock('@/features/tasks/tasks-context', () => ({
  useTasks: () => ({
    tasks: [],
    completeTask: jest.fn(),
    removeTask: jest.fn(),
  }),
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
  listItems.mockResolvedValue([])
})
jest.mock('./components/active-timer', () => ({ ActiveTimer: () => null }))
jest.mock('./components/task-timeline', () => ({ TaskTimeline: () => null }))
jest.mock('@/features/timer/focus-sessions-api', () => ({
  focusSessionsApi: { list: jest.fn() },
}))

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

  render(<DashboardPage />)
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
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(card).toHaveFocus()
  }
  fireEvent.click(
    screen.getByRole('button', { name: 'Ver tudo na agenda de hoje' }),
  )
  expect(mockGoTo).toHaveBeenCalledWith('agenda')
})
