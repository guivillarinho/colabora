import { GoogleInboundService } from './google-inbound.service'

const owner = '11111111-1111-4111-8111-111111111111'
const entity = '22222222-2222-4222-8222-222222222222'

function setup() {
  const source = { query: jest.fn().mockResolvedValue([]) }
  const notifications = { scheduleTaskReminders: jest.fn() }
  const manager = { query: source.query }
  Object.assign(source, {
    transaction: (fn: (manager: unknown) => unknown) => fn(manager),
  })
  const google = { authorized: jest.fn().mockResolvedValue('access') }
  const tasks = {
    listUpdated: jest.fn(),
    listLists: jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: '@default', title: 'Padrão' }] }),
    }),
  }
  const calendar = { listEvents: jest.fn() }
  const service = new GoogleInboundService(
    source as never,
    google as never,
    tasks as never,
    calendar as never,
    notifications as never,
  )
  return { service, source, google, tasks, calendar, notifications }
}

it('rejects a calendar webhook with an unknown channel token', async () => {
  const { service, source } = setup()
  source.query.mockResolvedValueOnce([
    { ownerId: owner, calendarId: 'primary', token: 'expected' },
  ])
  await expect(
    service.acceptWebhook({
      'x-goog-channel-id': 'channel',
      'x-goog-channel-token': 'other',
      'x-goog-resource-state': 'exists',
    }),
  ).resolves.toBe(false)
  expect(source.query).toHaveBeenCalledTimes(1)
})

it('queues a calendar pull and ignores events that Colabora did not create', async () => {
  const { service, source, calendar } = setup()
  source.query.mockImplementation(async (sql: string) => {
    if (
      String(sql).includes('google_watch_channels') &&
      String(sql).includes('SELECT "ownerId"')
    )
      return [{ ownerId: owner, calendarId: 'primary', token: 'secret' }]
    if (String(sql).includes('SELECT status,preferences'))
      return [
        {
          status: 'connected',
          preferences: { inboundEnabled: true, autoSync: true },
        },
      ]
    if (String(sql).includes('SELECT "syncToken"')) return [{ syncToken: null }]
    return []
  })
  await expect(
    service.acceptWebhook({
      'x-goog-channel-id': 'channel',
      'x-goog-channel-token': 'secret',
      'x-goog-resource-state': 'exists',
    }),
  ).resolves.toBe(true)
  expect(
    source.query.mock.calls.some((call) =>
      String(call[0]).includes('pull-calendar'),
    ),
  ).toBe(true)
  calendar.listEvents.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      items: [{ id: 'foreign', summary: 'Almoço', status: 'confirmed' }],
      nextSyncToken: 'next',
    }),
  })
  await service.pullCalendar(owner, 'primary')
  expect(
    source.query.mock.calls.some((call) =>
      String(call[0]).startsWith('UPDATE agenda_items'),
    ),
  ).toBe(false)
})

it('imports a Google event that was not created in Colabora', async () => {
  const { service, source, calendar } = setup()
  source.query.mockImplementation(async (sql: string) => {
    if (String(sql).includes('SELECT status,preferences'))
      return [{ status: 'connected', preferences: { inboundEnabled: true } }]
    if (String(sql).includes('SELECT "syncToken"')) return [{ syncToken: null }]
    if (String(sql).includes('INSERT INTO agenda_items'))
      return [{ id: entity }]
    return []
  })
  calendar.listEvents.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      items: [
        {
          id: 'foreign-event',
          summary: 'Consulta',
          status: 'confirmed',
          start: { dateTime: '2026-11-12T15:00:00.000Z' },
          end: { dateTime: '2026-11-12T16:00:00.000Z' },
        },
      ],
    }),
  })
  await service.pullCalendar(owner, 'primary')
  expect(
    source.query.mock.calls.some((call) =>
      String(call[0]).includes('INSERT INTO agenda_items'),
    ),
  ).toBe(true)
  expect(
    source.query.mock.calls.some((call) =>
      String(call[0]).includes('INSERT INTO google_sync_links'),
    ),
  ).toBe(true)
})

it('marks a conflict when the task changed on both sides', async () => {
  const { service, source, tasks } = setup()
  const past = new Date('2026-11-01T00:00:00.000Z')
  source.query.mockImplementation(async (sql: string) => {
    if (String(sql).includes('SELECT status,preferences'))
      return [{ status: 'connected', preferences: { inboundEnabled: true } }]
    if (String(sql).includes('tasksPolledAt')) return [{ tasksPolledAt: past }]
    if (String(sql).includes('google_sync_links WHERE "ownerId"'))
      return [
        {
          entityType: 'task',
          entityId: entity,
          googleKind: 'task',
          googleResourceId: 'remote',
          googleCalendarId: '@default',
          googleEtag: 'old',
          colaboraRevision: past,
          syncedAt: past,
          syncState: 'synced',
        },
      ]
    if (String(sql).includes('FROM tasks'))
      return [{ id: entity, updatedAt: new Date('2026-11-06T12:00:00.000Z') }]
    return []
  })
  tasks.listUpdated.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      items: [
        {
          id: 'remote',
          title: 'Remoto',
          notes: `nota\n[colabora:${entity}]`,
          status: 'needsAction',
          updated: '2026-11-06T12:10:00.000Z',
        },
      ],
    }),
  })
  await service.pullTasks(owner)
  expect(
    source.query.mock.calls.some((call) =>
      String(call[0]).includes(`"syncState"='conflict'`),
    ),
  ).toBe(true)
  expect(
    source.query.mock.calls.some((call) =>
      String(call[0]).startsWith('UPDATE tasks'),
    ),
  ).toBe(false)
})

it('keeps the scheduled hour when Google Tasks returns only the date', async () => {
  const { service, source, tasks, notifications } = setup()
  const dueDate = new Date('2026-11-13T12:00:00.000Z')
  source.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT status,preferences'))
      return [
        {
          status: 'connected',
          preferences: { inboundEnabled: true, autoSync: true },
        },
      ]
    if (sql.includes('FROM tasks') || sql.startsWith('UPDATE tasks'))
      return [{ id: entity, dueDate }]
    return []
  })
  tasks.listUpdated.mockResolvedValue({
    ok: true,
    json: async () => ({
      items: [
        {
          id: 'remote',
          title: 'Estudar',
          due: '2026-11-13T00:00:00Z',
          notes: `[colabora:${entity}]`,
        },
      ],
    }),
  })
  await service.pullTasks(owner)
  expect(source.query).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE tasks'),
    expect.arrayContaining([dueDate]),
  )
  expect(notifications.scheduleTaskReminders).toHaveBeenCalledWith(
    expect.objectContaining({ id: entity, dueDate }),
    expect.anything(),
  )
})

it('applies a Calendar time change to the linked task and reschedules its reminder', async () => {
  const { service, source, calendar, notifications } = setup()
  const dueDate = new Date('2026-11-13T13:00:00.000Z')
  source.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT status,preferences'))
      return [
        {
          status: 'connected',
          preferences: { inboundEnabled: true, autoSync: true },
        },
      ]
    if (sql.includes('FROM google_sync_links'))
      return [
        {
          entityId: entity,
          entityType: 'task_event',
          googleKind: 'event',
          googleResourceId: 'event',
          googleEtag: 'previous',
        },
      ]
    if (sql.includes('FROM tasks') || sql.startsWith('UPDATE tasks'))
      return [{ id: entity, dueDate }]
    return []
  })
  calendar.listEvents.mockResolvedValue({
    ok: true,
    json: async () => ({
      items: [
        {
          id: 'event',
          etag: 'changed',
          summary: 'Estudar',
          start: { dateTime: '2026-11-13T10:00:00-03:00' },
          end: { dateTime: '2026-11-13T10:45:00-03:00' },
        },
      ],
    }),
  })
  await service.pullCalendar(owner, 'primary')
  expect(source.query).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE tasks'),
    [entity, owner, 'Estudar', null, null, dueDate, 45, expect.any(Date)],
  )
  expect(notifications.scheduleTaskReminders).toHaveBeenCalledWith(
    expect.objectContaining({ id: entity, dueDate }),
    expect.anything(),
  )
  expect(source.query).toHaveBeenCalledWith(
    expect.stringContaining("'push-task'"),
    [owner, JSON.stringify({ taskId: entity, target: 'tasks' })],
  )
})
