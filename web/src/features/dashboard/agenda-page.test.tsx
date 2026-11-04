import { renderAuthenticated as render, taskAccess } from '@/test/auth-fixture'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AgendaPage } from './agenda-page'
import { TasksProvider } from '@/features/tasks/tasks-context'
import { tasksApi } from '@/features/tasks/api/tasks-api'
import { acceptHttpSession } from '@/lib/http-client'
import type { Task } from '@/features/tasks/types/task'
import { DashboardPage } from './dashboard-page'
import { NavigationProvider } from '@/components/layout/navigation'

jest.mock('@/features/tasks/api/tasks-api', () => ({
  tasksApi: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    start: jest.fn(),
    reopen: jest.fn(),
    complete: jest.fn(),
  },
}))

const api = tasksApi as jest.Mocked<typeof tasksApi>
const dueDate = new Date().toISOString()

describe('AgendaPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    acceptHttpSession('test-csrf-token')
    api.list.mockResolvedValue([
      {
        ...taskAccess,
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

  it.each([dueDate, null])(
    'reopens in Agenda a task completed in Hoje and returns it to the timeline (dueDate: %s)',
    async (date) => {
      const [original] = await api.list()
      const task = { ...original, dueDate: date }
      api.list.mockResolvedValue([task])
      const completed: Task = {
        ...task,
        status: 'completed',
        actualTime: 30,
        actualTimeSource: 'timer',
      }
      api.complete.mockResolvedValue({
        task: completed,
        productivityAdvice: null,
      })
      api.reopen.mockResolvedValue({
        ...task,
        status: 'pending',
        startedAt: null,
        actualTime: null,
        actualTimeSource: null,
      })
      const user = userEvent.setup()
      const view = (agenda: boolean) => (
        <TasksProvider>
          <NavigationProvider>
            {agenda ? <AgendaPage /> : <DashboardPage />}
          </NavigationProvider>
        </TasksProvider>
      )
      const { rerender } = render(view(false))
      const card = await screen.findByRole('article', {
        name: /Enviar proposta/,
      })
      card.focus()
      await user.keyboard('{ArrowRight}')
      expect(await screen.findByText('Nenhuma tarefa pendente.')).toBeVisible()
      expect(api.complete).toHaveBeenCalledWith('task-1', undefined)

      rerender(view(true))
      if (!date) {
        expect(
          await screen.findByRole('region', { name: 'Tarefas sem data' }),
        ).toBeVisible()
      }
      await user.click(
        await screen.findByRole('button', { name: /Enviar proposta/ }),
      )
      expect(
        within(screen.getByRole('dialog')).getByLabelText(
          'Situação: Concluída',
        ),
      ).toBeVisible()
      await user.click(screen.getByRole('button', { name: 'Reabrir tarefa' }))

      expect(api.reopen).toHaveBeenCalledWith('task-1')
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      )
      expect(screen.getByLabelText('Situação: Pendente')).toBeVisible()
      expect(
        screen.queryByLabelText('Tempo de execução'),
      ).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /Enviar proposta/ }))
      expect(
        screen.getByRole('button', { name: 'Concluir tarefa' }),
      ).toBeVisible()
      expect(
        screen.queryByRole('button', { name: 'Reabrir tarefa' }),
      ).not.toBeInTheDocument()
      await user.keyboard('{Escape}')

      rerender(view(false))
      expect(
        screen.getByRole('article', { name: /Enviar proposta/ }),
      ).toBeVisible()
      expect(
        screen.queryByText('Nenhuma tarefa pendente.'),
      ).not.toBeInTheDocument()
    },
  )

  it('keeps the completed task and allows retrying when reopening fails', async () => {
    const [task] = await api.list()
    api.list.mockResolvedValue([{ ...task, status: 'completed' }])
    api.reopen.mockRejectedValueOnce(new Error('Não foi possível reabrir.'))
    api.reopen.mockResolvedValueOnce({ ...task, status: 'pending' })
    const user = userEvent.setup()
    render(
      <TasksProvider>
        <AgendaPage />
      </TasksProvider>,
    )
    await user.click(
      await screen.findByRole('button', { name: /Enviar proposta/ }),
    )
    await user.click(screen.getByRole('button', { name: 'Reabrir tarefa' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível reabrir.',
    )
    expect(
      within(screen.getByRole('dialog')).getByLabelText('Situação: Concluída'),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Reabrir tarefa' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Situação: Pendente')).toBeVisible()
  })

  it('hides reopening when the user cannot change task status', async () => {
    const [task] = await api.list()
    api.list.mockResolvedValue([
      {
        ...task,
        status: 'completed',
        permissions: { ...task.permissions, changeStatus: false },
      },
    ])
    const user = userEvent.setup()
    render(
      <TasksProvider>
        <AgendaPage />
      </TasksProvider>,
    )
    await user.click(
      await screen.findByRole('button', { name: /Enviar proposta/ }),
    )
    expect(
      screen.queryByRole('button', { name: 'Reabrir tarefa' }),
    ).not.toBeInTheDocument()
  })

  it.each([
    {
      actualTime: 75,
      actualTimeSource: 'timer',
      label: 'Tempo de execução',
      duration: '1 h 15 min',
      compactDuration: '1h 15min',
    },
    {
      actualTime: 0,
      actualTimeSource: 'manual',
      label: 'Tempo de execução',
      duration: '0 min',
      compactDuration: '0min',
    },
    {
      actualTime: 20,
      actualTimeSource: 'schedule',
      label: 'Tempo estimado de execução',
      duration: '20 min',
      compactDuration: '20min',
    },
    {
      actualTime: 30,
      actualTimeSource: 'estimate',
      label: 'Tempo estimado de execução',
      duration: '30 min',
      compactDuration: '30min',
    },
    {
      actualTime: null,
      actualTimeSource: null,
      label: 'Tempo de execução',
      duration: 'Não registrado',
      compactDuration: 'não registrado',
    },
  ] as const)(
    'shows compact completion time on the card and its own section in details: $actualTimeSource / $actualTime',
    async ({
      actualTime,
      actualTimeSource,
      label,
      duration,
      compactDuration,
    }) => {
      const [task] = await api.list()
      api.list.mockResolvedValue([
        { ...task, status: 'completed', actualTime, actualTimeSource },
      ])
      const user = userEvent.setup()
      render(
        <TasksProvider>
          <AgendaPage />
        </TasksProvider>,
      )
      const card = await screen.findByRole('button', {
        name: /Enviar proposta/,
      })
      expect(
        within(card).getByText(`Concluído em: ${compactDuration}`),
      ).toBeVisible()
      expect(within(card).queryByText(label)).not.toBeInTheDocument()
      await user.click(card)
      const dialog = within(screen.getByRole('dialog'))
      expect(dialog.getByLabelText('Situação: Concluída')).toBeVisible()
      expect(
        within(dialog.getByRole('region', { name: label })).getByText(duration),
      ).toBeVisible()
      if (actualTimeSource === 'schedule')
        expect(dialog.getByText('Desde o horário agendado')).toBeVisible()
      expect(
        dialog.queryByRole('button', { name: 'Concluir tarefa' }),
      ).not.toBeInTheDocument()
    },
  )

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
        expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
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

  it('groups the description and makes its links clickable in details', async () => {
    const [task] = await api.list()
    api.list.mockResolvedValue([
      { ...task, description: 'Contrato: https://exemplo.com/contrato' },
    ])
    const user = userEvent.setup()
    render(
      <TasksProvider>
        <AgendaPage />
      </TasksProvider>,
    )
    const card = await screen.findByRole('button', { name: /Enviar proposta/ })
    expect(within(card).queryByRole('link')).not.toBeInTheDocument()
    await user.click(card)
    const description = within(screen.getByRole('dialog')).getByRole('region', {
      name: 'Descrição',
    })
    expect(
      within(description).getByRole('heading', { name: 'Descrição' }),
    ).toBeVisible()
    expect(
      within(description).getByRole('link', { name: /exemplo.com\/contrato/ }),
    ).toHaveAttribute('href', 'https://exemplo.com/contrato')
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
