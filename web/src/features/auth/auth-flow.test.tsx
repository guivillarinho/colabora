import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from './auth-context'
import { AuthGate } from './auth-gate'
import { authApi } from './auth-api'
import {
  HttpError,
  sessionExpiredEvent,
  clearHttpSession,
} from '@/lib/http-client'
import { tasksApi } from '@/features/tasks/api/tasks-api'
import { useTasks } from '@/features/tasks/tasks-context'
import { taskAccess } from '@/test/auth-fixture'

jest.mock('./auth-api', () => ({
  authApi: {
    me: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
  },
}))
jest.mock('@/features/tasks/api/tasks-api', () => ({
  tasksApi: { list: jest.fn() },
}))
jest.mock('@/app/App', () => ({ App: () => <MockPrivateContent /> }))
function MockPrivateContent() {
  const { user, logout } = useAuth()
  const { tasks } = useTasks()
  return (
    <section aria-label="Área privada">
      <h1>{user?.name}</h1>
      {tasks.map((task) => (
        <p key={task.id}>{task.title}</p>
      ))}
      <button
        onClick={() => {
          logout().catch(() => undefined)
        }}
      >
        Sair
      </button>
    </section>
  )
}
const api = authApi as jest.Mocked<typeof authApi>
const taskApi = tasksApi as jest.Mocked<typeof tasksApi>
const alice = { id: 'alice', name: 'Alice', email: 'alice@example.test' }
const bruno = { id: 'bruno', name: 'Bruno', email: 'bruno@example.test' }
function session(user = alice) {
  return { user, csrfToken: `csrf-${user.id}` }
}
function renderApp() {
  return render(
    <AuthProvider>
      <AuthGate />
    </AuthProvider>,
  )
}
async function signIn() {
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: 'Entre no seu ritmo' })
  await user.type(screen.getByLabelText('E-mail'), 'alice@example.test')
  await user.type(screen.getByLabelText('Senha'), 'safe-test-password')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
  return user
}
beforeEach(() => {
  jest.resetAllMocks()
  clearHttpSession()
  window.history.replaceState(null, '', '/')
  api.me.mockRejectedValue(new HttpError(401, 'Entre para continuar.'))
  api.login.mockResolvedValue(session())
  api.register.mockResolvedValue(session())
  api.logout.mockResolvedValue(undefined)
  taskApi.list.mockResolvedValue([])
})
it('does not flash private content while checking the session', () => {
  api.me.mockReturnValue(new Promise(() => undefined))
  renderApp()
  expect(screen.getByRole('status')).toHaveTextContent('Verificando sua sessão')
  expect(
    screen.queryByRole('region', { name: 'Área privada' }),
  ).not.toBeInTheDocument()
  expect(taskApi.list).not.toHaveBeenCalled()
})
it('validates login fields before sending data', async () => {
  const user = userEvent.setup()
  renderApp()
  await user.click(await screen.findByRole('button', { name: 'Entrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('e-mail válido')
  expect(api.login).not.toHaveBeenCalled()
})
it('signs in and preserves the private destination', async () => {
  window.history.replaceState(null, '', '/agenda')
  renderApp()
  await signIn()
  expect(await screen.findByRole('heading', { name: 'Alice' })).toBeVisible()
  expect(api.login).toHaveBeenCalledWith(
    'alice@example.test',
    'safe-test-password',
  )
  expect(window.location.pathname).toBe('/agenda')
})
it('shows authentication errors without loading private data', async () => {
  api.login.mockRejectedValue(new HttpError(401, 'E-mail ou senha inválidos.'))
  renderApp()
  await signIn()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'E-mail ou senha inválidos',
  )
  expect(taskApi.list).not.toHaveBeenCalled()
})
it('validates registration and creates the account', async () => {
  const user = userEvent.setup()
  renderApp()
  await user.click(
    await screen.findByRole('button', { name: 'Quero criar uma conta' }),
  )
  await user.type(screen.getByLabelText('Nome'), 'Alice')
  await user.type(screen.getByLabelText('E-mail'), 'alice@example.test')
  await user.type(screen.getByLabelText('Senha'), 'short')
  await user.click(screen.getByRole('button', { name: 'Criar conta' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'A senha ainda não atende a todos os requisitos.',
  )
  await user.clear(screen.getByLabelText('Senha'))
  await user.type(screen.getByLabelText('Senha'), 'Safe-test-password1!')
  await user.type(
    screen.getByLabelText('Confirmar senha'),
    'Safe-test-password1!',
  )
  await user.click(screen.getByRole('button', { name: 'Criar conta' }))
  expect(await screen.findByRole('heading', { name: 'Alice' })).toBeVisible()
  expect(api.register).toHaveBeenCalledWith(
    'Alice',
    'alice@example.test',
    'Safe-test-password1!',
  )
})
it('loads the current user and redirects away from login', async () => {
  window.history.replaceState(null, '', '/entrar')
  api.me.mockResolvedValue(session())
  renderApp()
  expect(await screen.findByRole('heading', { name: 'Alice' })).toBeVisible()
  await waitFor(() => expect(window.location.pathname).toBe('/hoje'))
  expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument()
})
it('unmounts private content after expiry', async () => {
  api.me.mockResolvedValue(session())
  renderApp()
  await screen.findByRole('heading', { name: 'Alice' })
  act(() => {
    clearHttpSession()
    window.dispatchEvent(new Event(sessionExpiredEvent))
  })
  expect(
    await screen.findByText(
      'Sua sessão expirou. Entre novamente para continuar.',
    ),
  ).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'Alice' }),
  ).not.toBeInTheDocument()
})
it('clears tasks on logout and isolates the next account', async () => {
  const user = userEvent.setup()
  api.me.mockResolvedValue(session())
  taskApi.list
    .mockResolvedValueOnce([
      { ...taskAccess, id: 'a', title: 'Privada de Alice' } as Awaited<
        ReturnType<typeof tasksApi.list>
      >[number],
    ])
    .mockResolvedValueOnce([])
  renderApp()
  expect(await screen.findByText('Privada de Alice')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Sair' }))
  await screen.findByLabelText('E-mail')
  expect(screen.queryByText('Privada de Alice')).not.toBeInTheDocument()
  api.login.mockResolvedValueOnce(session(bruno))
  await user.type(screen.getByLabelText('E-mail'), 'bruno@example.test')
  await user.type(screen.getByLabelText('Senha'), 'safe-test-password')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
  expect(await screen.findByRole('heading', { name: 'Bruno' })).toBeVisible()
  expect(screen.queryByText('Privada de Alice')).not.toBeInTheDocument()
})
it('prevents duplicate submissions during login', async () => {
  api.login.mockReturnValue(new Promise(() => undefined))
  renderApp()
  const user = await signIn()
  const button = screen.getByRole('button', { name: 'Aguarde...' })
  expect(button).toBeDisabled()
  await user.click(button)
  expect(api.login).toHaveBeenCalledTimes(1)
})

it('toggles password visibility without losing the value or button focus', async () => {
  const user = userEvent.setup()
  renderApp()
  const input = await screen.findByLabelText('Senha')
  await user.type(input, 'safe-test-password')
  const toggle = screen.getByRole('button', { name: 'Mostrar senha' })
  await user.click(toggle)
  expect(input).toHaveAttribute('type', 'text')
  expect(input).toHaveValue('safe-test-password')
  expect(toggle).toHaveFocus()
  expect(toggle).toHaveAttribute('aria-pressed', 'true')
  expect(toggle).toHaveAttribute('aria-controls', input.id)
  await user.keyboard(' ')
  expect(input).toHaveAttribute('type', 'password')
  expect(input).toHaveValue('safe-test-password')
  expect(toggle).toHaveFocus()
  expect(toggle).toHaveAttribute('aria-pressed', 'false')
})
