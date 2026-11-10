import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GoogleSettings } from './google-settings'
import { apiRequest } from '@/lib/http-client'
jest.mock('@/lib/http-client', () => ({ apiRequest: jest.fn() }))
jest.mock('@/features/tasks/tasks-context', () => ({
  useTasks: () => ({
    tasks: [
      {
        id: 'task-1',
        title: 'Planejar reunião',
        dueDate: '2026-11-06T12:00:00Z',
      },
      { id: 'unscheduled', title: 'Sem data', dueDate: null },
    ],
  }),
}))
beforeEach(() => jest.resetAllMocks())
it('shows that Calendar setup is pending', async () => {
  jest.mocked(apiRequest).mockResolvedValue({
    configured: false,
    status: 'disconnected',
    synced: [],
  })
  render(<GoogleSettings />)
  expect(
    await screen.findByText(
      'A conexão com o Google Agenda estará disponível assim que a configuração for concluída.',
    ),
  ).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Vincular Google Agenda' }),
  ).toBeDisabled()
})
it('requires selecting an eligible task and explicit confirmation before syncing', async () => {
  const user = userEvent.setup()
  jest
    .mocked(apiRequest)
    .mockResolvedValueOnce({
      configured: true,
      status: 'connected',
      synced: [],
    })
    .mockResolvedValueOnce({ synced: true })
    .mockResolvedValueOnce({
      configured: true,
      status: 'connected',
      synced: [{ taskId: 'task-1', syncedAt: '2026-11-06T12:00:00Z' }],
    })
  render(<GoogleSettings />)
  const task = await screen.findByRole('radio', { name: 'Planejar reunião' })
  const button = screen.getByRole('button', {
    name: 'Confirmar envio ao Google Agenda',
  })
  expect(button).toBeDisabled()
  expect(
    screen.queryByRole('radio', { name: 'Sem data' }),
  ).not.toBeInTheDocument()
  await user.click(task)
  expect(apiRequest).toHaveBeenCalledTimes(1)
  await user.click(button)
  expect(
    await screen.findByText('Tarefa enviada ao Google Agenda.'),
  ).toBeVisible()
  expect(apiRequest).toHaveBeenCalledWith('/google/sync', {
    method: 'POST',
    body: JSON.stringify({ taskId: 'task-1', confirmed: true }),
  })
  expect(screen.getByText(/Último envio/)).toBeVisible()
})
it('keeps a failed disconnect visible for retry', async () => {
  const user = userEvent.setup()
  jest
    .mocked(apiRequest)
    .mockResolvedValueOnce({
      configured: true,
      status: 'connected',
      synced: [],
    })
    .mockRejectedValueOnce(new Error('Revogação pendente'))
    .mockResolvedValueOnce({
      configured: true,
      status: 'disconnecting',
      synced: [],
    })
  render(<GoogleSettings />)
  await user.click(
    await screen.findByRole('button', { name: 'Desconectar Google' }),
  )
  expect(await screen.findByText('Revogação pendente')).toBeVisible()
  await waitFor(() =>
    expect(screen.queryByRole('radio')).not.toBeInTheDocument(),
  )
  expect(
    screen.getByRole('button', { name: 'Desconectar Google' }),
  ).toBeEnabled()
})

it('allows disconnecting an existing account even when new sync is disabled', async () => {
  jest
    .mocked(apiRequest)
    .mockResolvedValue({ configured: false, status: 'connected', synced: [] })
  render(<GoogleSettings />)
  expect(
    await screen.findByRole('button', { name: 'Desconectar Google' }),
  ).toBeEnabled()
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
})

it('allows retrying the integration status after a network failure', async () => {
  const user = userEvent.setup()
  jest
    .mocked(apiRequest)
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce({
      configured: true,
      status: 'disconnected',
      synced: [],
    })
  render(<GoogleSettings />)
  await user.click(
    await screen.findByRole('button', { name: 'Tentar novamente' }),
  )
  expect(
    await screen.findByRole('button', { name: 'Vincular Google Agenda' }),
  ).toBeVisible()
})

it('shows the connected Google email and clears the callback from the URL', async () => {
  window.history.replaceState(null, '', '/perfil?google=connected')
  jest.mocked(apiRequest).mockResolvedValue({
    configured: true,
    status: 'connected',
    email: 'agenda@example.test',
    synced: [],
  })
  render(<GoogleSettings />)
  expect(
    await screen.findByText('Conta vinculada: agenda@example.test'),
  ).toBeVisible()
  expect(screen.getByText('Conta Google vinculada com sucesso.')).toBeVisible()
  expect(window.location.search).toBe('')
})
