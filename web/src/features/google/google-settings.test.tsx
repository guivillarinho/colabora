import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GoogleSettings } from './google-settings'
import { apiRequest } from '@/lib/http-client'
jest.mock('@/lib/http-client', () => ({ apiRequest: jest.fn() }))
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
it('saves automatic sync preferences and lists recent link states', async () => {
  const user = userEvent.setup()
  const status = {
    configured: true,
    status: 'connected',
    email: 'agenda@example.test',
    synced: [],
    preferences: {
      autoSync: false,
      inboundEnabled: false,
      defaultCalendarId: 'primary',
      categoryTaskListMap: {},
    },
    links: [
      {
        entityType: 'task',
        entityId: 'task-1',
        googleKind: 'task',
        syncState: 'pending',
        syncedAt: '2026-11-06T12:00:00Z',
      },
    ],
    lastError: null,
  }
  jest
    .mocked(apiRequest)
    .mockResolvedValueOnce(status)
    .mockResolvedValueOnce([
      {
        id: 'cat-1',
        name: 'Pessoal',
        color: 'blue',
        googleListId: 'list-1',
        syncState: 'synced',
      },
    ])
    .mockResolvedValueOnce({ saved: true })
    .mockResolvedValueOnce({
      ...status,
      preferences: { ...status.preferences, autoSync: true },
    })
  render(<GoogleSettings />)
  expect(await screen.findByText(/Tarefa · Pendente/)).toBeVisible()
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Sincronizar automaticamente criações, edições e exclusões',
    }),
  )
  await user.click(screen.getByRole('button', { name: 'Salvar sincronização' }))
  expect(
    await screen.findByText('Preferências de sincronização salvas.'),
  ).toBeVisible()
  expect(apiRequest).toHaveBeenCalledWith('/google/preferences', {
    method: 'PATCH',
    body: JSON.stringify({
      autoSync: true,
      inboundEnabled: false,
      defaultCalendarId: 'primary',
      categoryTaskListMap: {},
    }),
  })
})

it('shows an expired token and the last Google error', async () => {
  jest.mocked(apiRequest).mockResolvedValue({
    configured: true,
    status: 'reconnect',
    synced: [],
    lastError: { message: 'Reconecte sua conta Google.' },
  })
  render(<GoogleSettings />)
  expect(await screen.findByText('Token expirado')).toBeVisible()
  expect(screen.getByText('Reconecte sua conta Google.')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Reconectar Google Agenda' }),
  ).toBeEnabled()
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
    .mockResolvedValueOnce([])
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
