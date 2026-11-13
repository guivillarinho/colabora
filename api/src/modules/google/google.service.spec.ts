import { ConfigService } from '@nestjs/config'
import { GoogleService, calendarScope, googleScopes } from './google.service'
const actor = '11111111-1111-4111-8111-111111111111'
const config: Record<string, string> = {
  GOOGLE_ENABLED: 'true',
  GOOGLE_CLIENT_ID: 'client',
  GOOGLE_CLIENT_SECRET: 'secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/google/callback',
  PUBLIC_APP_URL: 'http://localhost:5173',
  GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
}
function setup() {
  const source = { query: jest.fn().mockResolvedValue([]) }
  const tasks = {
    findOne: jest.fn().mockResolvedValue({
      title: 'Tarefa',
      description: 'Privada',
      dueDate: new Date('2026-11-06T12:00:00Z'),
      estimatedTime: 30,
    }),
  }
  const limits = { consume: jest.fn() }
  const service = new GoogleService(
    new ConfigService(config),
    source as never,
    tasks as never,
    limits as never,
  )
  return { service, source, tasks, limits }
}
const originalFetch = global.fetch
beforeEach(() => {
  global.fetch = jest.fn()
})
afterEach(() => {
  global.fetch = originalFetch
})
const response = (status: number, body: unknown = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response
it('creates session-bound, expiring state and S256 PKCE with minimum event scope', async () => {
  const { service } = setup()
  const { pending, url } = await service.start(actor)
  const auth = new URL(url)
  expect(auth.origin).toBe('https://accounts.google.com')
  expect(auth.searchParams.get('scope')).toBe(googleScopes)
  expect(auth.searchParams.get('prompt')).toContain('select_account')
  expect(auth.searchParams.get('code_challenge_method')).toBe('S256')
  expect(auth.searchParams.get('code_challenge')).not.toBe(pending.verifier)
  expect(pending.owner).toBe(actor)
  expect(pending.expires).toBeGreaterThan(Date.now())
  expect(url).not.toContain('secret')
})
it('encrypts with user binding, random IV and integrity protection', () => {
  const { service } = setup()
  const encrypted = service.encrypt('refresh-secret', actor)
  expect(encrypted).not.toContain('refresh-secret')
  expect(service.encrypt('refresh-secret', actor)).not.toBe(encrypted)
  expect(service.decrypt(encrypted, actor)).toBe('refresh-secret')
  expect(() => service.decrypt(encrypted, 'other')).toThrow()
  expect(() => service.decrypt(encrypted.slice(0, -4), actor)).toThrow()
})
it.each(['foreign', 'expired', 'wrong-owner'])(
  'rejects %s OAuth state before exchanging code',
  async (kind) => {
    const { service } = setup()
    const { pending } = await service.start(actor)
    if (kind === 'expired') pending.expires = 0
    if (kind === 'wrong-owner') pending.owner = 'other'
    await expect(
      service.callback(
        actor,
        pending,
        kind === 'foreign' ? 'foreign' : pending.state,
        'code',
      ),
    ).rejects.toThrow('inválida')
    expect(fetch).not.toHaveBeenCalled()
  },
)
it('requires refresh token and requested scope before saving the connection', async () => {
  const { service, source } = setup()
  const { pending } = await service.start(actor)
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(
      response(200, {
        refresh_token: 'refresh',
        access_token: 'access',
        scope: googleScopes,
      }),
    )
    .mockResolvedValueOnce(
      response(200, { email: 'calendar@example.test', email_verified: true }),
    )
  expect(await service.callback(actor, pending, pending.state, 'code')).toBe(
    'http://localhost:5173/perfil?google=connected',
  )
  const insert = source.query.mock.calls.find((call) =>
    String(call[0]).startsWith('INSERT'),
  )!
  expect(insert[1]).not.toContain('refresh')
  jest.mocked(fetch).mockResolvedValue(response(200, { scope: calendarScope }))
  await expect(
    service.callback(actor, pending, pending.state, 'code'),
  ).rejects.toThrow('vincular')
})
it('checks task authorization before touching Google', async () => {
  const { service, tasks } = setup()
  tasks.findOne.mockRejectedValue(new Error('Forbidden'))
  await expect(service.sync(actor, 'other-task')).rejects.toThrow('Forbidden')
  expect(fetch).not.toHaveBeenCalled()
})
it('creates deterministically, resolves a concurrent insert conflict and updates without duplicates', async () => {
  const { service, source } = setup()
  const row = {
    version: 'version',
    token: service.encrypt('refresh', actor),
    status: 'connected',
  }
  source.query.mockImplementation(async (sql: string) =>
    sql.startsWith('SELECT version') ? [row] : [],
  )
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(response(200, { access_token: 'access' }))
    .mockResolvedValueOnce(response(404))
    .mockResolvedValueOnce(response(409))
    .mockResolvedValueOnce(response(200))
  expect(await service.sync(actor, 'task')).toEqual({ synced: true })
  const calls = jest.mocked(fetch).mock.calls
  expect(calls[1][0]).toContain('sendUpdates=none')
  expect(calls[1][1]?.method).toBe('PUT')
  expect(calls[2][1]?.method).toBe('POST')
  expect(calls[3][1]?.method).toBe('PUT')
  const event = JSON.parse(String(calls[2][1]?.body))
  expect(event.id).toMatch(/^[0-9a-f]{64}$/)
  expect(event.end.dateTime).toBe('2026-11-06T12:30:00.000Z')
  expect(event).not.toHaveProperty('attendees')
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(response(200, { access_token: 'access' }))
    .mockResolvedValueOnce(response(200))
  await service.sync(actor, 'task')
  expect(jest.mocked(fetch).mock.calls[5][0]).toBe(calls[1][0])
})
it('marks revoked refresh tokens for reconnection and never attempts Calendar writes', async () => {
  const { service, source } = setup()
  source.query.mockResolvedValue([
    {
      version: 'v',
      token: service.encrypt('refresh', actor),
      status: 'connected',
    },
  ])
  jest.mocked(fetch).mockResolvedValue(response(400))
  await expect(service.sync(actor, 'task')).rejects.toThrow('sincronizar')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(
    source.query.mock.calls.some((call) =>
      String(call[0]).includes("status='reconnect'"),
    ),
  ).toBe(true)
})
it('keeps failed revocation pending and deletes credentials only after revocation succeeds', async () => {
  const { service, source } = setup()
  source.query.mockResolvedValue([
    {
      version: 'v',
      token: service.encrypt('refresh', actor),
      status: 'connected',
    },
  ])
  jest.mocked(fetch).mockRejectedValueOnce(new Error('Network'))
  await expect(service.disconnect(actor)).rejects.toThrow('Revogação pendente')
  expect(
    source.query.mock.calls.some((call) =>
      String(call[0]).startsWith('DELETE'),
    ),
  ).toBe(false)
  jest.mocked(fetch).mockResolvedValueOnce(response(200))
  await service.disconnect(actor)
  expect(
    source.query.mock.calls.some((call) =>
      String(call[0]).startsWith('DELETE'),
    ),
  ).toBe(true)
})

it('allows revocation while the feature flag is off', async () => {
  const { source, tasks, limits } = setup()
  const service = new GoogleService(
    new ConfigService({ ...config, GOOGLE_ENABLED: 'false' }),
    source as never,
    tasks as never,
    limits as never,
  )
  source.query.mockResolvedValue([
    {
      version: 'v',
      token: service.encrypt('refresh', actor),
      status: 'connected',
    },
  ])
  jest.mocked(fetch).mockResolvedValueOnce(response(200))
  await expect(service.disconnect(actor)).resolves.toBeUndefined()
})

it('returns cancellations to the profile only after validating state', async () => {
  const { service } = setup()
  const { pending } = await service.start(actor)
  expect(
    await service.callback(actor, pending, pending.state, '', 'access_denied'),
  ).toBe('http://localhost:5173/perfil?google=cancelled')
  await expect(
    service.callback(actor, pending, 'wrong', '', 'access_denied'),
  ).rejects.toThrow('inválida')
  expect(fetch).not.toHaveBeenCalled()
})

it('returns the connected email without exposing encrypted credentials', async () => {
  const { service, source } = setup()
  source.query
    .mockResolvedValueOnce([
      {
        status: 'connected',
        token: service.encrypt(
          JSON.stringify({
            refreshToken: 'refresh-private',
            email: 'calendar@example.test',
          }),
          actor,
        ),
      },
    ])
    .mockResolvedValueOnce([])
  expect(await service.status(actor)).toEqual({
    configured: true,
    status: 'connected',
    email: 'calendar@example.test',
    driveAttachmentsAuthorized: false,
    synced: [],
    links: [],
    preferences: {
      autoSync: false,
      inboundEnabled: false,
      defaultCalendarId: 'primary',
      categoryTaskListMap: {},
    },
    lastError: null,
  })
})
