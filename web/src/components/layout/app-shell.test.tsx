import { fireEvent, screen } from '@testing-library/react'
import { renderAuthenticated as render } from '@/test/auth-fixture'
import { AppShell } from './app-shell'
import { useNavigation } from './navigation'

jest.mock('./navigation', () => ({
  useNavigation: jest.fn(() => ({ section: 'hoje', goTo: jest.fn() })),
}))
jest.mock('./app-nav', () => ({ AppNav: () => null }))
jest.mock('@/features/tasks/tasks-context', () => ({
  useTasks: () => ({ advice: null, error: null, clearAdvice: jest.fn() }),
}))
jest.mock('@/features/dashboard/dashboard-page', () => ({
  DashboardPage: () => null,
}))
jest.mock('@/features/dashboard/agenda-page', () => ({
  AgendaPage: () => null,
}))
jest.mock('@/features/timer/timer-page', () => ({ TimerPage: () => null }))
jest.mock('@/features/auth/account-page', () => ({ AccountPage: () => null }))
jest.mock('@/features/tasks/components/task-form-dialog', () => ({
  CreateTaskDialog: () => null,
}))
jest.mock('@/features/tasks/components/productivity-advice-dialog', () => ({
  ProductivityAdviceDialog: () => null,
}))
jest.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }))

afterEach(() => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  jest.restoreAllMocks()
})

beforeEach(() => {
  jest
    .mocked(useNavigation)
    .mockReturnValue({ section: 'hoje', goTo: jest.fn() })
})

it('hides the header identity only on the profile and returns to Hoje', () => {
  const goTo = jest.fn()
  jest.mocked(useNavigation).mockReturnValue({ section: 'perfil', goTo })
  const { rerender } = render(<AppShell />)
  const header = screen.getByRole('banner')
  expect(header).toHaveTextContent('Perfil')
  expect(screen.queryByText('Olá, Guilherme')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('img', { name: 'Perfil de Guilherme' }),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Voltar para Hoje' }))
  expect(goTo).toHaveBeenCalledWith('hoje')
  jest.mocked(useNavigation).mockReturnValue({ section: 'hoje', goTo })
  rerender(<AppShell />)
  expect(header).toHaveTextContent('Olá, Guilherme')
  expect(screen.getByRole('img', { name: 'Perfil de Guilherme' })).toBeVisible()
})

it('changes the header on scroll, restores it at the top and cleans up its listener', () => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  const add = jest.spyOn(window, 'addEventListener')
  const remove = jest.spyOn(window, 'removeEventListener')
  const { unmount } = render(<AppShell />)
  const header = screen.getByRole('banner')
  expect(header).toHaveAttribute('data-scrolled', 'false')
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 100 })
  fireEvent.scroll(window)
  expect(header).toHaveAttribute('data-scrolled', 'true')
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  fireEvent.scroll(window)
  expect(header).toHaveAttribute('data-scrolled', 'false')
  const scrollCall = add.mock.calls.find(([type]) => type === 'scroll')!
  expect(scrollCall[2]).toEqual({ passive: true })
  unmount()
  expect(remove).toHaveBeenCalledWith('scroll', scrollCall[1])
})

it('starts with the scrolled appearance when restoring a scroll position', () => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 80 })
  render(<AppShell />)
  expect(screen.getByRole('banner')).toHaveAttribute('data-scrolled', 'true')
})
