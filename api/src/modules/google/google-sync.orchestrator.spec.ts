import { ConfigService } from '@nestjs/config'

import { GoogleSyncOrchestrator } from './google-sync.orchestrator'

const owner = '11111111-1111-4111-8111-111111111111'
const taskId = '22222222-2222-4222-8222-222222222222'

function setup() {
  const source = { query: jest.fn().mockResolvedValue([]) }
  const google = { authorized: jest.fn().mockResolvedValue('access') }
  const inbound = { pullCalendar: jest.fn(), pullTasks: jest.fn() }
  const tasks = { upsert: jest.fn(), remove: jest.fn(), listLists: jest.fn() }
  const calendar = {
    upsert: jest.fn(),
    remove: jest.fn(),
    listCalendars: jest.fn(),
    watch: jest.fn(),
    stop: jest.fn(),
  }
  const service = new GoogleSyncOrchestrator(
    source as never,
    new ConfigService({
      GOOGLE_WEBHOOK_URL: 'https://app.example/api/google/webhook/calendar',
    }),
    google as never,
    inbound as never,
    tasks as never,
    calendar as never,
  )
  return { service, source, google, inbound, tasks, calendar }
}

it('does not enqueue a push while automatic sync is off', async () => {
  const { service, source } = setup()
  source.query.mockResolvedValueOnce([
    { status: 'connected', preferences: { autoSync: false } },
  ])
  await service.enqueue(owner, 'push-task', { taskId })
  expect(
    source.query.mock.calls.some((call) =>
      String(call[0]).includes('google_sync_outbox'),
    ),
  ).toBe(false)
})

it('creates a Google Task for a dated Colabora task and records the link', async () => {
  const { service, source, tasks } = setup()
  source.query.mockImplementation(async (sql: string) => {
    if (String(sql).includes('FROM google_sync_outbox'))
      return [
        {
          id: 'outbox-1',
          ownerId: owner,
          operation: 'push-task',
          payload: { taskId },
          attempts: 0,
        },
      ]
    if (String(sql).includes('SELECT status,preferences'))
      return [
        {
          status: 'connected',
          preferences: {
            autoSync: true,
            categoryTaskListMap: { Pessoal: 'list-1' },
            defaultCalendarId: 'primary',
          },
        },
      ]
    if (String(sql).includes('FROM tasks'))
      return [
        {
          id: taskId,
          title: 'Estudar',
          description: 'Capítulo 1',
          category: 'Pessoal',
          dueDate: '2026-11-06T12:00:00.000Z',
          status: 'pending',
          updatedAt: new Date('2026-11-06T11:00:00.000Z'),
          createdById: owner,
        },
      ]
    return []
  })
  tasks.upsert.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'remote-task', etag: 'e1' }),
  })
  await service.drain()
  expect(tasks.upsert).toHaveBeenCalledWith(
    'access',
    'list-1',
    null,
    expect.objectContaining({
      title: 'Estudar',
      due: '2026-11-06T12:00:00.000Z',
      status: 'needsAction',
    }),
  )
  expect(
    source.query.mock.calls.some((call) =>
      String(call[0]).includes('INSERT INTO google_sync_links'),
    ),
  ).toBe(true)
})

it('keeps a failed push in the outbox', async () => {
  const { service, source, tasks } = setup()
  source.query.mockImplementation(async (sql: string) => {
    if (String(sql).includes('FROM google_sync_outbox'))
      return [
        {
          id: 'outbox-1',
          ownerId: owner,
          operation: 'push-task',
          payload: { taskId },
          attempts: 0,
        },
      ]
    if (String(sql).includes('SELECT status,preferences'))
      return [{ status: 'connected', preferences: { autoSync: true } }]
    if (String(sql).includes('FROM tasks'))
      return [
        {
          id: taskId,
          title: 'Estudar',
          category: 'Pessoal',
          dueDate: '2026-11-06T12:00:00.000Z',
          status: 'pending',
          updatedAt: new Date(),
        },
      ]
    return []
  })
  tasks.upsert.mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({}),
  })
  await service.drain()
  expect(
    source.query.mock.calls.some((call) =>
      String(call[0]).includes('UPDATE google_sync_outbox'),
    ),
  ).toBe(true)
})
