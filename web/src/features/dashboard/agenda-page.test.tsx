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
import {
  AgendaUploadError,
  uploadAgendaFiles,
  type AgendaUploadOptions,
} from './upload-agenda-files'

jest.mock('./upload-agenda-files', () => {
  const actual = jest.requireActual('./upload-agenda-files')
  return {
    ...actual,
    uploadAgendaFiles: jest.fn(),
  }
})

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
    const card = screen.getByRole('button', { name: /Enviar proposta/ })
    expect(card).toHaveClass('h-52', 'colabora-timeline-card')
    expect(
      within(card).getByRole('heading', { name: 'Enviar proposta' }),
    ).toBeVisible()
    expect(screen.getByRole('region', { name: 'Semana' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Adicionar/ })).toBeVisible()
    expect(
      screen.queryByLabelText('Pesquisar tarefas, eventos e projetos'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Pesquisar na agenda' }),
    ).toBeVisible()
  })

  it('refreshes the open task details after editing from the pencil', async () => {
    const [original] = await api.list()
    api.update.mockResolvedValue({
      ...original,
      title: 'Proposta revisada',
      dueDate: null,
      updatedAt: new Date(Date.now() + 1000).toISOString(),
    })
    const user = userEvent.setup()
    render(
      <TasksProvider>
        <AgendaPage />
      </TasksProvider>,
    )
    await user.click(
      await screen.findByRole('button', { name: /Enviar proposta/ }),
    )
    await user.click(screen.getByRole('button', { name: 'Editar tarefa' }))
    const editor = within(screen.getByRole('dialog', { name: 'Editar tarefa' }))
    await user.clear(editor.getByLabelText('Título'))
    await user.type(editor.getByLabelText('Título'), 'Proposta revisada')
    await user.clear(editor.getByLabelText('Data e hora'))
    await user.click(editor.getByRole('button', { name: 'Salvar tarefa' }))
    const details = await screen.findByRole('dialog', {
      name: 'Proposta revisada',
    })
    expect(within(details).getByText('Sem data agendada.')).toBeVisible()
    expect(api.update).toHaveBeenCalledWith(
      original.id,
      expect.objectContaining({ title: 'Proposta revisada', dueDate: null }),
    )
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

  it('shows honest upload progress and keeps the save action available after failure', async () => {
    const user = userEvent.setup()
    let fail: (error: Error) => void = () => undefined
    jest.mocked(uploadAgendaFiles).mockImplementation(
      (_files, _id, options) =>
        new Promise((_resolve, reject) => {
          options?.onProgress?.({
            index: 1,
            total: 2,
            name: 'proposta.pdf',
            percentage: 40,
          })
          fail = reject
        }),
    )
    render(
      <TasksProvider>
        <AgendaPage />
      </TasksProvider>,
    )
    await user.click(await screen.findByRole('button', { name: /Adicionar/ }))
    await user.upload(
      screen.getByLabelText('Enviar documentos'),
      new File(['%PDF'], 'proposta.pdf', { type: 'application/pdf' }),
    )
    expect(await screen.findByText('Enviando 1 de 2 · 40%')).toBeVisible()
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '40',
    )
    expect(
      screen.getByRole('button', { name: 'Salvar na agenda' }),
    ).toBeDisabled()
    fail(
      new AgendaUploadError('Falhou no meio.', 'failed', [
        {
          name: 'pronto.pdf',
          url: '/uploads/agenda/11111111-1111-4111-8111-111111111111.pdf',
        },
      ]),
    )
    expect(await screen.findByText('pronto.pdf')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou no meio.')
    expect(screen.queryByText(/Enviando/)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Salvar na agenda' }),
    ).toBeEnabled()
    expect(screen.queryByText('proposta.pdf')).not.toBeInTheDocument()
  })

  it('cancels an agenda upload and does not keep the interrupted file', async () => {
    const user = userEvent.setup()
    jest.mocked(uploadAgendaFiles).mockImplementation(
      (_files, _userId, options?: AgendaUploadOptions) =>
        new Promise((_resolve, reject) => {
          options?.onProgress?.({
            index: 1,
            total: 1,
            name: 'proposta.pdf',
            percentage: null,
          })
          options?.signal?.addEventListener('abort', () => {
            reject(new AgendaUploadError('Envio cancelado.', 'cancelled'))
          })
        }),
    )
    render(
      <TasksProvider>
        <AgendaPage />
      </TasksProvider>,
    )
    await user.click(await screen.findByRole('button', { name: /Adicionar/ }))
    await user.upload(
      screen.getByLabelText('Enviar documentos'),
      new File(['%PDF'], 'proposta.pdf', { type: 'application/pdf' }),
    )
    expect(await screen.findByText('Enviando 1 de 1')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Salvar na agenda' }),
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Cancelar envio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Envio cancelado.',
    )
    expect(screen.queryByText(/Enviando/)).not.toBeInTheDocument()
    expect(screen.queryByText('proposta.pdf')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Salvar na agenda' }),
    ).toBeEnabled()
  })

  it('stops the upload when the dialog closes', async () => {
    const user = userEvent.setup()
    let signal: AbortSignal | undefined
    jest
      .mocked(uploadAgendaFiles)
      .mockImplementation((_files, _id, options) => {
        signal = options?.signal
        options?.onProgress?.({
          index: 1,
          total: 1,
          name: 'proposta.pdf',
          percentage: null,
        })
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new AgendaUploadError('Envio cancelado.', 'cancelled'))
          })
        })
      })
    render(
      <TasksProvider>
        <AgendaPage />
      </TasksProvider>,
    )
    await user.click(await screen.findByRole('button', { name: /Adicionar/ }))
    await user.upload(
      screen.getByLabelText('Enviar documentos'),
      new File(['%PDF'], 'proposta.pdf', { type: 'application/pdf' }),
    )
    expect(await screen.findByText('Enviando 1 de 1')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(signal?.aborted).toBe(true))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Adicionar/ }))
    expect(screen.queryByText(/Enviando/)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Salvar na agenda' }),
    ).toBeEnabled()
  })

  it('sends at most 10 files and explains the files left out', async () => {
    const user = userEvent.setup()
    jest.mocked(uploadAgendaFiles).mockResolvedValue([])
    render(
      <TasksProvider>
        <AgendaPage />
      </TasksProvider>,
    )
    await user.click(await screen.findByRole('button', { name: /Adicionar/ }))
    await user.upload(
      screen.getByLabelText('Enviar documentos'),
      Array.from(
        { length: 11 },
        (_, index) =>
          new File(['%PDF'], `arquivo-${index}.pdf`, {
            type: 'application/pdf',
          }),
      ),
    )
    await waitFor(() => expect(uploadAgendaFiles).toHaveBeenCalled())
    expect(jest.mocked(uploadAgendaFiles).mock.calls[0][0]).toHaveLength(10)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Os excedentes não foram enviados.',
    )
    expect(
      screen.getByRole('button', { name: 'Salvar na agenda' }),
    ).toBeEnabled()
  })
})
