import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AgendaPage } from './agenda-page'
import { TasksProvider } from '@/features/tasks/tasks-context'
import { tasksApi } from '@/features/tasks/api/tasks-api'
import type { Task } from '@/features/tasks/types/task'

jest.mock('@/features/tasks/api/tasks-api', () => ({
  tasksApi: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    start: jest.fn(),
    complete: jest.fn(),
  },
}))

const api = tasksApi as jest.Mocked<typeof tasksApi>
const dueDate = new Date().toISOString()

describe('AgendaPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    api.list.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Enviar proposta',
        description: 'Revisar contrato',
        category: 'Trabalho',
        priority: 'medium',
        color: 'red',
        dueDate,
        location: null,
        attachments: [],
        estimatedTime: 30,
        actualTime: null,
        status: 'pending',
        startedAt: null,
        createdAt: dueDate,
        updatedAt: dueDate,
      } as Task,
    ])
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] }) as jest.Mock
  })

  it('shows the week and scheduled tasks for the selected day', async () => {
    render(
      <TasksProvider>
        <AgendaPage />
      </TasksProvider>,
    )

    expect(await screen.findByText('Enviar proposta')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Semana' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Adicionar/ })).toBeVisible()
    expect(
      screen.queryByLabelText('Pesquisar tarefas, eventos e projetos'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Pesquisar na agenda' }),
    ).toBeVisible()
  })

  it.each(['event', 'project'])(
    'deletes a %s only after confirmation',
    async (type) => {
      const user = userEvent.setup()
      const fetchMock = globalThis.fetch as jest.Mock
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: 'agenda-1',
              title: 'Reunião de planejamento',
              type,
              startDate: dueDate,
              endDate: dueDate,
              description: null,
              location: null,
              attachments: [],
              icon: null,
            },
          ],
        })
        .mockResolvedValueOnce({ ok: true })
      render(
        <TasksProvider>
          <AgendaPage />
        </TasksProvider>,
      )
      await user.click(
        await screen.findByRole('button', { name: /Reunião de planejamento/ }),
      )
      await user.click(
        screen.getByRole('button', {
          name: type === 'event' ? 'Excluir evento' : 'Excluir projeto',
        }),
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await user.click(
        screen.getByRole('button', { name: 'Confirmar exclusão' }),
      )
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/agenda-items/agenda-1'),
        { method: 'DELETE' },
      )
      expect(
        screen.queryByRole('button', { name: /Reunião de planejamento/ }),
      ).not.toBeInTheDocument()
    },
  )

  it('deletes a task from the agenda after confirmation', async () => {
    const user = userEvent.setup()
    api.remove.mockResolvedValue(undefined)
    render(
      <TasksProvider>
        <AgendaPage />
      </TasksProvider>,
    )
    await user.click(
      await screen.findByRole('button', { name: /Enviar proposta/ }),
    )
    await user.click(screen.getByRole('button', { name: 'Excluir tarefa' }))
    expect(api.remove).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    expect(api.remove).toHaveBeenCalledWith('task-1')
    expect(
      screen.queryByRole('button', { name: /Enviar proposta/ }),
    ).not.toBeInTheDocument()
  })

  it('searches task descriptions and opens item details', async () => {
    const user = userEvent.setup()
    render(
      <TasksProvider>
        <AgendaPage />
      </TasksProvider>,
    )
    await screen.findByText('Enviar proposta')
    await user.click(
      screen.getByRole('button', { name: 'Pesquisar na agenda' }),
    )
    await user.type(
      screen.getByLabelText('Pesquisar tarefas, eventos e projetos'),
      'contrato',
    )
    await user.click(screen.getByRole('button', { name: /Enviar proposta/ }))

    expect(
      (await screen.findAllByText('Tarefa · Trabalho')).length,
    ).toBeGreaterThan(0)
    expect(
      (await screen.findAllByText('Revisar contrato')).length,
    ).toBeGreaterThan(0)
  })

  it('opens an empty search-only page with sorting available', async () => {
    const user = userEvent.setup()
    render(
      <TasksProvider>
        <AgendaPage />
      </TasksProvider>,
    )
    await screen.findByText('Enviar proposta')
    await user.click(
      screen.getByRole('button', { name: 'Pesquisar na agenda' }),
    )

    expect(screen.getByRole('heading', { name: 'Pesquisar' })).toBeVisible()
    expect(screen.getByText('O que você está procurando?')).toBeVisible()
    expect(
      screen.getByRole('combobox', { name: 'Ordenar resultados' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('region', { name: 'Semana' }),
    ).not.toBeInTheDocument()
  })
})
