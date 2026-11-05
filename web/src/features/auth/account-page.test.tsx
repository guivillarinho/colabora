import { screen } from '@testing-library/react'
import { renderAuthenticated as render } from '@/test/auth-fixture'
import { useTasks } from '@/features/tasks/tasks-context'
import type { Task } from '@/features/tasks/types/task'
import { AccountPage } from './account-page'

jest.mock('@/features/tasks/tasks-context', () => ({ useTasks: jest.fn() }))

it('shows category statistics in the profile using current task data', () => {
  jest.mocked(useTasks).mockReturnValue({
    tasks: [
      { category: 'Trabalho', status: 'completed', actualTime: 75 },
      { category: 'Trabalho', status: 'pending', actualTime: 100 },
    ] as Task[],
  } as ReturnType<typeof useTasks>)
  const { rerender } = render(<AccountPage />)
  expect(
    screen.getByRole('heading', { name: 'Tempo por categoria' }),
  ).toBeVisible()
  expect(screen.getAllByText('1 h 15 min')).toHaveLength(2)
  jest
    .mocked(useTasks)
    .mockReturnValue({ tasks: [] } as unknown as ReturnType<typeof useTasks>)
  rerender(<AccountPage />)
  expect(
    screen.getByText(
      'Conclua tarefas com tempo registrado para visualizar o gráfico.',
    ),
  ).toBeVisible()
  expect(screen.queryByText('1 h 15 min')).not.toBeInTheDocument()
})
