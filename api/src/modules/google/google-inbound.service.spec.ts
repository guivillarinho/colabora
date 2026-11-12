import { GoogleInboundService } from './google-inbound.service'

const owner = '11111111-1111-4111-8111-111111111111'
const entity = '22222222-2222-4222-8222-222222222222'

function setup() {
  const source = { query: jest.fn().mockResolvedValue([]) }
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
  )
  return { service, source, google, tasks, calendar }
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
