import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatPage } from './chat-page'
import { apiRequest } from '@/lib/http-client'
const mockAcceptTask = jest.fn()
jest.mock('@/lib/http-client', () => ({ apiRequest: jest.fn() }))
jest.mock('@/components/layout/navigation', () => ({
  useNavigation: () => ({ goTo: jest.fn() }),
}))
jest.mock('@/features/tasks/tasks-context', () => ({
  useTasks: () => ({
    acceptTask: mockAcceptTask,
    completeTask: jest.fn(),
    removeTask: jest.fn(),
  }),
}))
jest.mock('@/features/dashboard/agenda-page', () => ({
  AgendaDetails: () => null,
}))
it('requires consent, shows an editable proposal and saves only after confirmation', async () => {
  const user = userEvent.setup()
  jest
    .mocked(apiRequest)
    .mockResolvedValueOnce({
      reply: 'Revise',
      ready: true,
      title: 'Reunião',
      description: '',
      dueDate: '2026-11-06T12:00:00Z',
      priority: 'medium',
      estimatedTime: 30,
    })
    .mockResolvedValueOnce({ id: 'saved', title: 'Reunião' })
  render(<ChatPage />)
  await user.type(
    screen.getByLabelText('Mensagem'),
    'Reunião amanhã ao meio dia',
  )
  expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Enviar' }))
  expect(await screen.findByLabelText('Título')).toHaveValue('Reunião')
  expect(apiRequest).toHaveBeenCalledTimes(1)
  await user.click(
    screen.getByRole('button', { name: 'Confirmar e criar tarefa' }),
  )
  expect(await screen.findByText(/Tarefa criada/)).toBeVisible()
  expect(mockAcceptTask).toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Abrir tarefa' })).toBeVisible()
})

it('preserves the proposal and idempotency key when retrying a failed confirmation', async () => {
  jest.resetAllMocks()
  const user = userEvent.setup()
  jest
    .mocked(apiRequest)
    .mockResolvedValueOnce({
      reply: 'Confira o horário',
      ready: true,
      title: 'Reunião',
      description: '',
      dueDate: '2026-11-06T12:00:00Z',
      priority: 'medium',
      estimatedTime: 30,
    })
    .mockRejectedValueOnce(new Error('Conexão interrompida.'))
    .mockResolvedValueOnce({ id: 'saved', title: 'Reunião' })
  render(<ChatPage />)
  await user.click(screen.getByRole('checkbox'))
  await user.type(
    screen.getByLabelText('Mensagem'),
    'Agendar reunião amanhã às 9',
  )
  await user.click(screen.getByRole('button', { name: 'Enviar' }))
  const confirm = await screen.findByRole('button', {
    name: 'Confirmar e criar tarefa',
  })
  await user.click(confirm)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Conexão interrompida.',
  )
  expect(screen.getByLabelText('Título')).toHaveValue('Reunião')
  await user.click(confirm)
  expect(await screen.findByText(/Tarefa criada/)).toBeVisible()
  const first = JSON.parse(
    String(jest.mocked(apiRequest).mock.calls[1][1]?.body),
  )
  const retry = JSON.parse(
    String(jest.mocked(apiRequest).mock.calls[2][1]?.body),
  )
  expect(retry.requestId).toBe(first.requestId)
  expect(mockAcceptTask).toHaveBeenCalledTimes(1)
})

it('retains the typed message after an unavailable provider and allows resending', async () => {
  jest.resetAllMocks()
  const user = userEvent.setup()
  jest
    .mocked(apiRequest)
    .mockRejectedValueOnce(new Error('Serviço indisponível.'))
    .mockResolvedValueOnce({ reply: 'Qual horário?', ready: false })
  render(<ChatPage />)
  await user.click(screen.getByRole('checkbox'))
  await user.type(screen.getByLabelText('Mensagem'), 'Reunião amanhã')
  await user.click(screen.getByRole('button', { name: 'Enviar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Serviço indisponível.',
  )
  expect(screen.getByLabelText('Mensagem')).toHaveValue('Reunião amanhã')
  await user.click(screen.getByRole('button', { name: 'Enviar' }))
  expect(
    await screen.findByText('Qual horário?', { exact: false }),
  ).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Confirmar e criar tarefa' }),
  ).not.toBeInTheDocument()
})
