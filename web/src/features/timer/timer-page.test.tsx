import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { focusSessionsApi } from './focus-sessions-api'
import { TimerPage } from './timer-page'
import type { FocusSession } from './types'

jest.mock('./focus-sessions-api', () => ({
  focusSessionsApi: {
    list: jest.fn(),
    start: jest.fn(),
    finish: jest.fn(),
  },
}))

const api = focusSessionsApi as jest.Mocked<typeof focusSessionsApi>

describe('TimerPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    api.list.mockResolvedValue([])
  })

  it('shows responsive progress cards and an empty history state', async () => {
    render(<TimerPage />)

    expect(await screen.findByRole('heading', { name: 'Timer' })).toBeVisible()
    expect(screen.getByLabelText('Conquistas de foco')).toBeVisible()
    expect(screen.queryByText('Sessões de hoje')).not.toBeInTheDocument()
    expect(screen.queryByText('Foco hoje')).not.toBeInTheDocument()
    expect(screen.queryByText('Tempo total')).not.toBeInTheDocument()
    expect(
      await screen.findByText('Suas sessões concluídas aparecerão aqui.'),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Iniciar sessão' })).toBeVisible()
  })

  it('starts and displays a named live focus session', async () => {
    const user = userEvent.setup()
    api.start.mockImplementation(async (title) => buildSession(title))

    render(<TimerPage />)

    await user.type(
      await screen.findByLabelText('No que vai focar?'),
      'Escrever proposta',
    )
    await user.click(screen.getByRole('button', { name: 'Iniciar sessão' }))

    expect(await screen.findByText('Sessão em andamento')).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Escrever proposta' }),
    ).toBeVisible()
    expect(screen.getByRole('timer')).toBeVisible()
    expect(api.start).toHaveBeenCalledWith('Escrever proposta', 25, 5)
    expect(
      screen.getByRole('button', { name: 'Encerrar sessão' }),
    ).toBeVisible()
  })

  it('restores and finishes an active session into the history', async () => {
    const user = userEvent.setup()
    const active = buildSession('Leitura focada')
    api.list.mockResolvedValue([active])
    api.finish.mockImplementation(async () => ({
      ...active,
      endedAt: new Date().toISOString(),
    }))

    render(<TimerPage />)

    expect(await screen.findByText('Sessão em andamento')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Encerrar sessão' }))

    await waitFor(() => {
      expect(api.finish).toHaveBeenCalledWith(active.id)
    })
    expect(screen.queryByText('Sessão em andamento')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Leitura focada' }),
    ).toBeVisible()
  })

  it('restores an expired cycle, celebrates once and starts the rest countdown', async () => {
    const active = {
      ...buildSession('Estudo'),
      focusMinutes: 1,
      breakMinutes: 5,
      startedAt: new Date(Date.now() - 61_000).toISOString(),
    }
    api.list.mockResolvedValue([active])
    api.finish.mockResolvedValue({
      ...active,
      endedAt: new Date(Date.parse(active.startedAt) + 60_000).toISOString(),
    })
    render(<TimerPage />)
    expect(await screen.findByText('Foco concluído! +100 pontos')).toBeVisible()
    expect(screen.getByText('Hora de descansar')).toBeVisible()
    expect(screen.getByText('100 pontos · 1 ciclos completos')).toBeVisible()
    expect(api.finish).toHaveBeenCalledTimes(1)
  })

  it('sends customized focus and rest durations', async () => {
    const user = userEvent.setup()
    api.start.mockImplementation(async (title) => buildSession(title))
    render(<TimerPage />)
    const focus = await screen.findByLabelText('Foco (minutos)')
    await user.clear(focus)
    await user.type(focus, '40')
    const rest = screen.getByLabelText('Descanso (minutos)')
    await user.clear(rest)
    await user.type(rest, '10')
    await user.click(screen.getByRole('button', { name: 'Iniciar sessão' }))
    expect(api.start).toHaveBeenCalledWith('', 40, 10)
  })

  it('shows an error when the session cannot be started', async () => {
    const user = userEvent.setup()
    api.start.mockRejectedValue(new Error('Já existe uma sessão ativa.'))

    render(<TimerPage />)

    await user.click(
      await screen.findByRole('button', { name: 'Iniciar sessão' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe uma sessão ativa.',
    )
  })
})

function buildSession(title: string): FocusSession {
  return {
    id: 'session-1',
    title: title || 'Foco livre',
    startedAt: new Date().toISOString(),
    endedAt: null,
    createdAt: new Date().toISOString(),
  }
}
