import { render, screen } from '@testing-library/react'
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
jest.mock('@/components/layout/navigation', () => ({
  useNavigation: () => ({ goTo: jest.fn() }),
}))
jest.mock('./components/active-timer', () => ({ ActiveTimer: () => null }))
jest.mock('./components/task-timeline', () => ({ TaskTimeline: () => null }))
jest.mock('@/features/timer/focus-sessions-api', () => ({
  focusSessionsApi: { list: jest.fn() },
}))

it('keeps focus sessions and achievements out of Hoje', () => {
  render(<DashboardPage />)
  expect(screen.getByRole('heading', { name: 'Hoje' })).toBeVisible()
  expect(screen.queryByText('Dashboard de foco')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Conquistas de foco')).not.toBeInTheDocument()
  expect(screen.queryByText('Sessões recentes')).not.toBeInTheDocument()
  expect(screen.queryByText('Tempo por categoria')).not.toBeInTheDocument()
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
