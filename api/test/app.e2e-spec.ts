import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assignLegacy } from '../src/database/assign-legacy'
import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { Client } from 'pg'
import { DataSource } from 'typeorm'
import { randomBytes, randomUUID } from 'node:crypto'
import { readdir, rm } from 'node:fs/promises'
import { createApplication } from '../src/bootstrap'
import { InitialSchema1793448000000 } from '../src/database/migrations/1793448000000-initial-schema'
jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }))

const origin = 'http://localhost:5173'
const password = 'A-test-password-123!'
const schema = `security_${randomUUID().replace(/-/g, '')}`
const uploadDir = join(tmpdir(), `colabora-security-${randomUUID()}`)
type Actor = {
  agent: ReturnType<typeof request.agent>
  csrf: string
  user: { id: string; name: string; email: string }
  cookie: string
}

function cookieHeaders(response: request.Response): string {
  const cookies: unknown = response.headers['set-cookie']
  return Array.isArray(cookies) ? cookies.join(';') : String(cookies ?? '')
}

// This suite refuses production URLs. It only uses the dedicated, disposable test database.
describe('Authentication, ownership and CSRF (HTTP + isolated PostgreSQL)', () => {
  let app: INestApplication
  let admin: Client
  let source: DataSource
  let serial = 0
  const oldEnv = { ...process.env }

  beforeAll(async () => {
    const url = new URL(
      process.env.TEST_DATABASE_URL ??
        'postgresql://colabora_test:colabora_test@127.0.0.1:55432/colabora_test',
    )
    if (
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/colabora_test' ||
      url.port !== '55432'
    )
      throw new Error(
        'E2E somente no PostgreSQL local exclusivo colabora_test:55432.',
      )
    // Raw SQL migrations and session storage must use the isolated schema too.
    url.searchParams.set('options', `-c search_path=${schema},public`)
    Object.assign(process.env, {
      DATABASE_URL: url.toString(),
      NODE_ENV: 'test',
      DB_SCHEMA: schema,
      SESSION_SECRET: randomBytes(48).toString('hex'),
      SESSION_IDLE_MINUTES: '30',
      SESSION_ABSOLUTE_HOURS: '168',
      AUTH_LOGIN_LIMIT: '3',
      AUTH_IP_LIMIT: '1000',
      AUTH_REGISTER_LIMIT: '1000',
      AUTH_CSRF_LIMIT: '1000',
      WEB_ORIGIN: origin,
      UPLOADS_DIRECTORY: uploadDir,
    })
    delete process.env.VERCEL
    admin = new Client({ connectionString: url.toString() })
    await admin.connect()
    await admin.query(`CREATE SCHEMA "${schema}"`)
    await admin.query(`SET search_path TO "${schema}"`)
    const initial = new InitialSchema1793448000000()
    await initial.up({ query: (sql: string) => admin.query(sql) } as Parameters<
      typeof initial.up
    >[0])
    await admin.query(
      `INSERT INTO tasks (title,category,color,"estimatedTime") VALUES ('Legacy private','Pessoal','blue',30)`,
    )
    app = await createApplication()
    await app.init()
    source = app.get(DataSource)
  }, 60000)

  afterAll(async () => {
    await app?.close()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await admin.end()
    }
    await rm(uploadDir, { recursive: true, force: true })
    for (const key of Object.keys(process.env))
      if (!(key in oldEnv)) delete process.env[key]
    Object.assign(process.env, oldEnv)
  })

  async function anonymous() {
    const agent = request.agent(app.getHttpServer())
    const response = await agent.get('/api/auth/csrf').expect(200)
    return {
      agent,
      csrf: response.body.csrfToken as string,
      cookie: String(response.headers['set-cookie'][0]).split(';')[0],
    }
  }
  async function actor(label = 'Pessoa'): Promise<Actor> {
    const client = await anonymous()
    const email = `user-${++serial}-${randomUUID()}@example.test`
    const response = await client.agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .set('X-CSRF-Token', client.csrf)
      .send({ name: `${label} ${serial}`, email, password })
      .expect(201)
    return {
      agent: client.agent,
      csrf: response.body.csrfToken,
      user: response.body.user,
      cookie: String(response.headers['set-cookie'][0]).split(';')[0],
    }
  }
  async function task(owner: Actor, extras = {}) {
    const response = await owner.agent
      .post('/api/tasks')
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .send({
        title: 'Planejamento',
        category: 'Pessoal',
        color: 'blue',
        estimatedTime: 30,
        ...extras,
      })
      .expect(201)
    return response.body as {
      id: string
      createdById: string
      assignedToId: string
      attachments: string[]
    }
  }
  function patch(owner: Actor, id: string, body: object) {
    return owner.agent
      .patch(`/api/tasks/${id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .send(body)
  }

  it('persists future reminders for tasks, events and projects in the shared queue', async () => {
    const owner = await actor()
    const start = new Date(Date.now() + 30 * 60_000)
    const scheduled = await task(owner, {
      dueDate: start.toISOString(),
      reminderOffsets: [5],
    })
    const rows = async (id: string) =>
      (
        await admin.query(
          'SELECT "scheduledAt", "userId" FROM task_reminders WHERE "taskId" = $1 OR "agendaItemId" = $1',
          [id],
        )
      ).rows as { scheduledAt: Date; userId: string }[]
    expect(await rows(scheduled.id)).toEqual([
      {
        scheduledAt: new Date(start.getTime() - 5 * 60_000),
        userId: owner.user.id,
      },
    ])
    await patch(owner, scheduled.id, { reminderOffsets: [60] }).expect(400)
    await patch(owner, scheduled.id, { title: 'Revisão' }).expect(200)
    expect(await rows(scheduled.id)).toHaveLength(1)

    for (const type of ['event', 'project']) {
      const create = (reminderOffsets: number[]) =>
        owner.agent
          .post('/api/agenda-items')
          .set('Origin', origin)
          .set('X-CSRF-Token', owner.csrf)
          .send({
            title: 'Apresentação',
            type,
            startDate: start.toISOString(),
            endDate: new Date(start.getTime() + 60 * 60_000).toISOString(),
            reminderOffsets,
          })
      await create([60]).expect(400)
      const created = await create([15]).expect(201)
      const id = created.body.id as string
      expect(await rows(id)).toEqual([
        {
          scheduledAt: new Date(start.getTime() - 15 * 60_000),
          userId: owner.user.id,
        },
      ])
      await owner.agent
        .delete(`/api/agenda-items/${id}`)
        .set('Origin', origin)
        .set('X-CSRF-Token', owner.csrf)
        .expect(204)
      expect(await rows(id)).toEqual([])
    }
  })

  it('protects Google OAuth state, encrypts credentials and scopes explicit sync by user', async () => {
    const original = { ...process.env }
    const googleFetch = jest.spyOn(global, 'fetch')
    Object.assign(process.env, {
      GOOGLE_ENABLED: 'true',
      GOOGLE_CLIENT_ID: 'test-client',
      GOOGLE_CLIENT_SECRET: 'test-secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/google/callback',
      PUBLIC_APP_URL: origin,
      GOOGLE_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    })
    const scope = 'https://www.googleapis.com/auth/calendar.events.owned'
    const reply = (body: unknown, status = 200) =>
      ({ ok: status === 200, status, json: async () => body }) as Response
    try {
      const a = await actor()
      const b = await actor()
      await request(app.getHttpServer()).get('/api/google/status').expect(401)
      await a.agent
        .post('/api/google/connect')
        .set('Origin', origin)
        .expect(403)
      const connect = () =>
        a.agent
          .post('/api/google/connect')
          .set('Origin', origin)
          .set('X-CSRF-Token', a.csrf)
      const first = await connect().expect(201)
      const state = new URL(first.body.url).searchParams.get('state')!
      await b.agent
        .get('/api/google/callback')
        .query({ state, code: 'code' })
        .expect(302)
        .expect('Location', `${origin}/perfil?google=error`)
      expect(googleFetch).not.toHaveBeenCalled()
      googleFetch.mockResolvedValueOnce(
        reply({
          refresh_token: 'private-refresh',
          access_token: 'private-access',
          scope,
        }),
      )
      googleFetch.mockResolvedValueOnce(
        reply({ email: 'calendar@example.test', email_verified: true }),
      )
      await a.agent
        .get('/api/google/callback')
        .query({ state, code: 'code' })
        .expect(302)
        .expect('Location', `${origin}/perfil?google=connected`)
        .expect('Referrer-Policy', 'no-referrer')
      await a.agent
        .get('/api/google/callback')
        .query({ state, code: 'code' })
        .expect(302)
        .expect('Location', `${origin}/perfil?google=error`)
      expect(googleFetch).toHaveBeenCalledTimes(2)
      const [stored] = await source.query(
        'SELECT token FROM google_connections WHERE "ownerId"=$1',
        [a.user.id],
      )
      expect(stored.token).not.toContain('private-refresh')
      const publicStatus = await a.agent.get('/api/google/status').expect(200)
      expect(publicStatus.body.status).toBe('connected')
      expect(publicStatus.body.email).toBe('calendar@example.test')
      expect(publicStatus.body).not.toHaveProperty('token')
      expect(
        (await b.agent.get('/api/google/status').expect(200)).body.status,
      ).toBe('disconnected')
      const scheduled = await task(a, { dueDate: '2026-11-06T12:00:00Z' })
      const sync = (owner: Actor, confirmed = true) =>
        owner.agent
          .post('/api/google/sync')
          .set('Origin', origin)
          .set('X-CSRF-Token', owner.csrf)
          .send({ taskId: scheduled.id, confirmed })
      await sync(a, false).expect(400)
      await sync(b).expect(404)
      googleFetch
        .mockResolvedValueOnce(reply({ access_token: 'access' }))
        .mockResolvedValueOnce(reply({}, 404))
        .mockResolvedValueOnce(reply({}))
      await sync(a).expect(201)
      googleFetch
        .mockResolvedValueOnce(reply({ access_token: 'access' }))
        .mockResolvedValueOnce(reply({}))
      await sync(a).expect(201)
      const rows = await source.query(
        'SELECT * FROM google_calendar_sync WHERE "ownerId"=$1',
        [a.user.id],
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].taskId).toBe(scheduled.id)
      googleFetch.mockResolvedValueOnce(reply({}))
      await a.agent
        .post('/api/google/disconnect')
        .set('Origin', origin)
        .set('X-CSRF-Token', a.csrf)
        .expect(201)
      expect(
        (await a.agent.get('/api/google/status').expect(200)).body.status,
      ).toBe('disconnected')
      expect(
        await source.query(
          'SELECT token FROM google_connections WHERE "ownerId"=$1',
          [a.user.id],
        ),
      ).toEqual([])
    } finally {
      googleFetch.mockRestore()
      for (const key of Object.keys(process.env))
        if (!(key in original)) delete process.env[key]
      Object.assign(process.env, original)
    }
  })

  it('confirms assistant proposals idempotently and isolates users', async () => {
    const a = await actor()
    const b = await actor()
    const input = {
      requestId: randomUUID(),
      confirmed: true,
      title: 'Assistant task',
      dueDate: '2026-11-06T12:00:00Z',
      category: 'Pessoal',
      color: 'purple',
      estimatedTime: 30,
    }
    const confirm = (owner: Actor) =>
      owner.agent
        .post('/api/assistant/confirm')
        .set('Origin', origin)
        .set('X-CSRF-Token', owner.csrf)
        .send(input)
    const results = await Promise.all([confirm(a), confirm(a)])
    expect(results.map((r) => r.status)).toEqual([201, 201])
    expect(results[0].body.id).toBe(results[1].body.id)
    const other = await confirm(b)
    expect(other.status).toBe(201)
    expect(other.body.id).not.toBe(results[0].body.id)
    await a.agent
      .delete(`/api/tasks/${results[0].body.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .expect(204)
    await confirm(a).expect(409)
  })

  it('keeps the existing health check public', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200, { status: 'ok' })
  })

  it('uses exact credentialed CORS, bounded preflight and private cache even for errors', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/tasks')
      .set('Origin', origin)
      .expect(401)
    expect(allowed.headers['access-control-allow-origin']).toBe(origin)
    expect(allowed.headers['access-control-allow-credentials']).toBe('true')
    expect(allowed.headers.vary).toContain('Origin')
    expect(allowed.headers['cache-control']).toBe('private, no-store')
    expect(allowed.headers['x-content-type-options']).toBe('nosniff')
    for (const foreign of [
      'https://evil.example',
      `${origin}.evil.example`,
      'null',
    ]) {
      const denied = await request(app.getHttpServer())
        .get('/api/tasks')
        .set('Origin', foreign)
        .expect(401)
      expect(denied.headers['access-control-allow-origin']).toBeUndefined()
      expect(denied.headers['cache-control']).toBe('private, no-store')
    }
    const preflight = await request(app.getHttpServer())
      .options('/api/tasks')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'PATCH')
      .set(
        'Access-Control-Request-Headers',
        'X-CSRF-Token,X-Session-User,Content-Type',
      )
      .expect(204)
    expect(
      preflight.headers['access-control-allow-methods'].split(','),
    ).toEqual(['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'])
    expect(
      preflight.headers['access-control-allow-headers']
        .toLowerCase()
        .split(','),
    ).toEqual(['content-type', 'x-csrf-token', 'x-session-user'])
    const denied = await request(app.getHttpServer())
      .options('/api/tasks')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'TRACE')
      .expect(204)
    expect(denied.headers['access-control-allow-origin']).toBeUndefined()
    expect(denied.headers['access-control-allow-methods']).not.toContain(
      'TRACE',
    )
  })

  it('preserves legacy data but never hands it to the first signup', async () => {
    const user = await actor()
    const records = await source.query(
      'SELECT "createdById" FROM tasks WHERE title = $1',
      ['Legacy private'],
    )
    expect(records).toEqual([{ createdById: null }])
    const response = await user.agent.get('/api/tasks').expect(200)
    expect(response.body).toEqual([])
  })

  it('registers a user with a private cookie and a password hash only in the database', async () => {
    const user = await actor()
    expect(user.cookie).toContain('colabora.sid=')
    const response = await user.agent.get('/api/auth/me').expect(200)
    expect(cookieHeaders(response)).toMatch(/HttpOnly/)
    expect(cookieHeaders(response)).toMatch(/SameSite=Lax/)
    expect(response.body.user).not.toHaveProperty('passwordHash')
    const [stored] = await source.query(
      'SELECT "passwordHash" FROM users WHERE id = $1',
      [user.user.id],
    )
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/)
  })

  it('rejects invalid signup and repeated email without returning database errors', async () => {
    const client = await anonymous()
    await client.agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .set('X-CSRF-Token', client.csrf)
      .send({ name: 'A', email: 'not-email', password: 'short' })
      .expect(400)
    const user = await actor()
    const other = await anonymous()
    const duplicate = await other.agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .set('X-CSRF-Token', other.csrf)
      .send({
        name: 'Outra Pessoa',
        email: user.user.email.toUpperCase(),
        password,
      })
      .expect(400)
    expect(JSON.stringify(duplicate.body)).not.toMatch(
      /23505|passwordHash|stack|duplicate key/,
    )
  })

  it('logs in, rotates the identifier and keeps sessions across application requests', async () => {
    const existing = await actor()
    const client = await anonymous()
    const response = await client.agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', client.csrf)
      .send({ email: existing.user.email, password })
      .expect(200)
    expect(String(response.headers['set-cookie'][0]).split(';')[0]).not.toEqual(
      client.cookie,
    )
    await client.agent.get('/api/auth/me').expect(200)
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', client.cookie)
      .expect(401)
    const concurrent = await anonymous()
    await concurrent.agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', concurrent.csrf)
      .send({ email: existing.user.email, password })
      .expect(200)
    await client.agent.get('/api/auth/me').expect(200)
  })

  it('returns the same login error for an incorrect password and a nonexistent user', async () => {
    const user = await actor()
    const client = await anonymous()
    const wrong = await client.agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', client.csrf)
      .send({ email: user.user.email, password: 'wrong' })
      .expect(401)
    const missing = await client.agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', client.csrf)
      .send({ email: `${randomUUID()}@example.test`, password: 'wrong' })
      .expect(401)
    expect(wrong.body).toEqual(missing.body)
  })

  it('requires authentication for every private resource', async () => {
    for (const path of [
      '/api/auth/me',
      '/api/tasks',
      '/api/agenda-items',
      '/api/focus-sessions',
      '/api/users?query=abc',
      '/api/uploads/agenda/test.txt',
    ])
      await request(app.getHttpServer()).get(path).expect(401)
    await request(app.getHttpServer())
      .get('/api/tasks')
      .set('Cookie', 'colabora.sid=invalid')
      .expect(401)
    await request(app.getHttpServer())
      .delete(`/api/tasks/${randomUUID()}`)
      .expect(401)
  })

  it.each(['authLastSeenAt', 'authStartedAt'])(
    'expires a session by %s',
    async (field) => {
      const user = await actor()
      await source.query(
        `UPDATE app_sessions SET sess = jsonb_set(sess::jsonb, $1::text[], '0'::jsonb)::json WHERE sess->'passport'->>'user' = $2`,
        [[field], user.user.id],
      )
      await user.agent.get('/api/auth/me').expect(401)
      await user.agent.get('/api/tasks').expect(401)
    },
  )

  it('revokes logout cookies even if an in-flight request recreates the old session row', async () => {
    const user = await actor()
    const [old] = await source.query(
      `SELECT * FROM app_sessions WHERE sess->'passport'->>'user' = $1`,
      [user.user.id],
    )
    const logout = await user.agent
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', user.csrf)
      .expect(204)
    expect(cookieHeaders(logout)).toContain('Expires=Thu, 01 Jan 1970')
    await source.query(
      'INSERT INTO app_sessions (sid,sess,expire) VALUES ($1,$2,$3) ON CONFLICT (sid) DO UPDATE SET sess=EXCLUDED.sess, expire=EXCLUDED.expire',
      [old.sid, old.sess, old.expire],
    )
    await request(app.getHttpServer())
      .get('/api/tasks')
      .set('Cookie', user.cookie)
      .expect(401)
  })

  it('switches accounts without leaving the old identifier valid', async () => {
    const a = await actor('Alpha')
    const b = await actor('Bravo')
    await task(a)
    const oldCookie = a.cookie
    const login = await a.agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .send({ email: b.user.email, password })
      .expect(200)
    expect(login.body.user.id).toBe(b.user.id)
    expect((await a.agent.get('/api/tasks').expect(200)).body).toEqual([])
    await request(app.getHttpServer())
      .get('/api/tasks')
      .set('Cookie', oldCookie)
      .expect(401)
  })

  it('rejects missing CSRF tokens, foreign origins and cross-site login', async () => {
    const user = await actor()
    await user.agent
      .post('/api/tasks')
      .set('Origin', origin)
      .send({})
      .expect(403)
    await user.agent
      .post('/api/tasks')
      .set('Origin', 'https://attacker.example')
      .set('X-CSRF-Token', user.csrf)
      .send({})
      .expect(403)
    await user.agent
      .post('/api/tasks')
      .set('Origin', origin)
      .set('X-CSRF-Token', 'é'.repeat(64))
      .send({})
      .expect(403)
    const client = await anonymous()
    await client.agent
      .post('/api/auth/login')
      .set('Origin', 'https://attacker.example')
      .set('X-CSRF-Token', client.csrf)
      .send({ email: user.user.email, password })
      .expect(403)
    await user.agent
      .get('/api/tasks')
      .set('Origin', 'https://attacker.example')
      .expect(200)
      .expect((response) => {
        expect(response.headers['access-control-allow-origin']).toBeUndefined()
      })
  })

  it('enforces the complete A/B/C assignment lifecycle and rejects IDOR and mass assignment', async () => {
    const a = await actor('Alpha')
    const b = await actor('Bravo')
    const c = await actor('Charlie')
    const created = await task(a)
    expect(created.createdById).toBe(a.user.id)
    await a.agent.get(`/api/tasks/${created.id}`).expect(200)
    await b.agent.get(`/api/tasks/${created.id}`).expect(404)
    await c.agent.get(`/api/tasks/${created.id}`).expect(404)
    await patch(c, created.id, { title: 'Invadida' }).expect(404)
    await patch(a, created.id, { assignedToId: b.user.id }).expect(200)
    const visible = await b.agent.get(`/api/tasks/${created.id}`).expect(200)
    expect(visible.body.permissions).toEqual({
      edit: false,
      assign: false,
      delete: false,
      changeStatus: false,
    })
    expect(visible.body.createdBy).toEqual({ id: a.user.id, name: a.user.name })
    expect(visible.body.createdBy).not.toHaveProperty('email')
    expect(visible.body.assignmentStatus).toBe('pending')
    for (const participant of [a, b]) {
      await participant.agent
        .post(`/api/tasks/${created.id}/complete`)
        .set('Origin', origin)
        .set('X-CSRF-Token', participant.csrf)
        .send({})
        .expect(403)
    }
    await a.agent
      .patch(`/api/tasks/${created.id}/assignment`)
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .send({ response: 'accepted' })
      .expect(403)
    await b.agent
      .patch(`/api/tasks/${created.id}/assignment`)
      .set('Origin', origin)
      .set('X-CSRF-Token', b.csrf)
      .send({ response: 'accepted' })
      .expect(200)
    await b.agent
      .patch(`/api/tasks/${created.id}/assignment`)
      .set('Origin', origin)
      .set('X-CSRF-Token', b.csrf)
      .send({ response: 'declined' })
      .expect(400)

    await b.agent
      .patch(`/api/tasks/${created.id}/status`)
      .set('Origin', origin)
      .set('X-CSRF-Token', b.csrf)
      .send({ status: 'in_progress' })
      .expect(200)
    await b.agent
      .delete(`/api/tasks/${created.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', b.csrf)
      .expect(403)
    await patch(b, created.id, { assignedToId: c.user.id }).expect(403)
    await patch(b, created.id, { createdById: b.user.id }).expect(400)
    await patch(a, created.id, { createdById: c.user.id }).expect(400)
    await patch(a, created.id, { assignedToId: randomUUID() }).expect(400)
    await patch(a, created.id, { title: null }).expect(400)
    expect(
      (
        await b.agent.get(`/api/tasks?userId=${c.user.id}`).expect(200)
      ).body.map((item: { id: string }) => item.id),
    ).toEqual([created.id])
    expect(
      (await c.agent.get(`/api/tasks?createdById=${a.user.id}`).expect(200))
        .body,
    ).toEqual([])
    await a.agent
      .patch(`/api/tasks/${created.id}/status`)
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .send({ status: 'pending' })
      .expect(200)
    await patch(a, created.id, { assignedToId: c.user.id }).expect(200)
    await c.agent
      .patch(`/api/tasks/${created.id}/assignment`)
      .set('Origin', origin)
      .set('X-CSRF-Token', c.csrf)
      .send({ response: 'declined' })
      .expect(200)
    await c.agent
      .post(`/api/tasks/${created.id}/start`)
      .set('Origin', origin)
      .set('X-CSRF-Token', c.csrf)
      .expect(403)
    const declined = await a.agent.get(`/api/tasks/${created.id}`).expect(200)
    expect(declined.body.assignmentStatus).toBe('declined')
    await patch(a, created.id, { assignedToId: null }).expect(200)
    await patch(a, created.id, { assignedToId: c.user.id }).expect(200)
    await c.agent
      .patch(`/api/tasks/${created.id}/assignment`)
      .set('Origin', origin)
      .set('X-CSRF-Token', c.csrf)
      .send({ response: 'accepted' })
      .expect(200)

    await b.agent.get(`/api/tasks/${created.id}`).expect(404)
    await b.agent
      .post(`/api/tasks/${created.id}/complete`)
      .set('Origin', origin)
      .set('X-CSRF-Token', b.csrf)
      .send({ actualTime: 20 })
      .expect(404)
    await c.agent
      .post(`/api/tasks/${created.id}/complete`)
      .set('Origin', origin)
      .set('X-CSRF-Token', c.csrf)
      .send({ actualTime: 20 })
      .expect(200)
    for (const participant of [a, c]) {
      const history = await participant.agent.get('/api/tasks').expect(200)
      expect(history.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: created.id,
            status: 'completed',
            completedAt: expect.any(String),
          }),
        ]),
      )
    }
    await a.agent
      .delete(`/api/tasks/${created.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .expect(204)
  })

  it('completes without a manual duration and persists its calculation source', async () => {
    const owner = await actor()
    const created = await task(owner, {
      dueDate: new Date(Date.now() - 25 * 60000).toISOString(),
    })
    const complete = () =>
      owner.agent
        .post(`/api/tasks/${created.id}/complete`)
        .set('Origin', origin)
        .set('X-CSRF-Token', owner.csrf)
        .send({})
    const result = await complete().expect(200)
    expect(result.body.task.actualTime).toBe(25)
    expect(result.body.task.actualTimeSource).toBe('schedule')
    expect(result.body.productivityAdvice).toBeNull()
    const stored = await owner.agent.get(`/api/tasks/${created.id}`).expect(200)
    expect(stored.body.actualTimeSource).toBe('schedule')
    expect(stored.body.status).toBe('completed')
    const retried = await complete().expect(200)
    expect(retried.body.task.actualTime).toBe(25)
  })

  it('prioritizes the recorded timer when completing automatically', async () => {
    const owner = await actor()
    const created = await task(owner, {
      dueDate: new Date(Date.now() - 60 * 60000).toISOString(),
    })
    await owner.agent
      .post(`/api/tasks/${created.id}/start`)
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .send({})
      .expect(200)
    await source.query(
      `UPDATE "${schema}".tasks SET "startedAt" = now() - interval '12 minutes' WHERE id = $1`,
      [created.id],
    )
    const result = await owner.agent
      .post(`/api/tasks/${created.id}/complete`)
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .send({})
      .expect(200)
    expect(result.body.task.actualTime).toBe(12)
    expect(result.body.task.actualTimeSource).toBe('timer')
  })

  it('accepts only integer numeric durations and preserves the task on invalid completion', async () => {
    const owner = await actor()
    const created = await task(owner)
    for (const estimatedTime of [
      'letters',
      '1e2',
      '60',
      true,
      null,
      1.5,
      0,
      10081,
    ]) {
      await owner.agent
        .post('/api/tasks')
        .set('Origin', origin)
        .set('X-CSRF-Token', owner.csrf)
        .send({
          title: 'Invalid estimate',
          category: 'Pessoal',
          color: 'blue',
          estimatedTime,
        })
        .expect(400)
      await patch(owner, created.id, { estimatedTime }).expect(400)
    }
    for (const actualTime of [
      'letters',
      '1e2',
      '20',
      true,
      false,
      '',
      null,
      1.5,
      -1,
      10081,
    ]) {
      await owner.agent
        .post(`/api/tasks/${created.id}/complete`)
        .set('Origin', origin)
        .set('X-CSRF-Token', owner.csrf)
        .send({ actualTime })
        .expect(400)
    }
    const unchanged = await owner.agent
      .get(`/api/tasks/${created.id}`)
      .expect(200)
    expect(unchanged.body.status).toBe('pending')
    expect(unchanged.body.actualTime).toBeNull()
    const finished = await owner.agent
      .post(`/api/tasks/${created.id}/complete`)
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .send({ actualTime: 0 })
      .expect(200)
    expect(finished.body.task.status).toBe('completed')
    expect(finished.body.task.actualTime).toBe(0)
  })

  it('stores appearance only on the authenticated account and restores it at login', async () => {
    const a = await actor('Aparência Alpha')
    const b = await actor('Aparência Bravo')
    await a.agent
      .patch('/api/users/me/preferences')
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .send({ theme: 'dark', palette: 'green' })
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect({ theme: 'dark', palette: 'green' })
    const saved = await a.agent.get('/api/auth/me').expect(200)
    expect(saved.body.user.preferences).toEqual({
      theme: 'dark',
      palette: 'green',
    })
    const other = await b.agent.get('/api/auth/me').expect(200)
    expect(other.body.user.preferences).toEqual({
      theme: 'system',
      palette: 'purple',
    })
    await a.agent
      .patch('/api/users/me/preferences')
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .send({ theme: 'light' })
      .expect(200)
      .expect({ theme: 'light', palette: 'green' })
    expect((await a.agent.get('/api/auth/me')).body.user.preferences).toEqual({
      theme: 'light',
      palette: 'green',
    })
    for (const body of [
      { theme: null },
      { palette: 'invalid' },
      { userId: b.user.id, theme: 'dark' },
    ]) {
      await a.agent
        .patch('/api/users/me/preferences')
        .set('Origin', origin)
        .set('X-CSRF-Token', a.csrf)
        .send(body)
        .expect(400)
    }
    const client = await anonymous()
    const login = await client.agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', client.csrf)
      .send({ email: a.user.email, password })
      .expect(200)
    expect(login.body.user.preferences).toEqual({
      theme: 'light',
      palette: 'green',
    })
  })

  it('limits the user directory to public fields and bounded searches', async () => {
    const user = await actor('Directory')
    await user.agent.get('/api/users?query=a').expect(400)
    const nameSearch = await user.agent
      .get('/api/users?query=Directory')
      .expect(200)
    expect(nameSearch.body).toEqual([
      { id: user.user.id, name: user.user.name, avatar: null },
    ])
    const missing = await user.agent
      .get('/api/users?query=nobody%40example.test')
      .expect(200)
    expect(missing.body).toEqual([])
    const result = await user.agent
      .get(
        `/api/users?query=${encodeURIComponent(user.user.email.toUpperCase())}`,
      )
      .expect(200)
    expect(result.body).toEqual([
      { id: user.user.id, name: user.user.name, avatar: null },
    ])
    expect(result.body.length).toBeLessThanOrEqual(10)
  })

  it.each(['event', 'project'])(
    'isolates %s agenda items and focus sessions by owner',
    async (kind) => {
      const a = await actor()
      const b = await actor()
      const item = await a.agent
        .post('/api/agenda-items')
        .set('Origin', origin)
        .set('X-CSRF-Token', a.csrf)
        .send({
          title: 'Privado',
          type: kind,
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
        })
        .expect(201)
      expect((await b.agent.get('/api/agenda-items').expect(200)).body).toEqual(
        [],
      )
      await b.agent
        .delete(`/api/agenda-items/${item.body.id}`)
        .set('Origin', origin)
        .set('X-CSRF-Token', b.csrf)
        .expect(404)
      const focus = await a.agent
        .post('/api/focus-sessions')
        .set('Origin', origin)
        .set('X-CSRF-Token', a.csrf)
        .send({ title: 'Foco A' })
        .expect(201)
      await b.agent
        .post('/api/focus-sessions')
        .set('Origin', origin)
        .set('X-CSRF-Token', b.csrf)
        .send({ title: 'Foco B' })
        .expect(201)
      await b.agent
        .post(`/api/focus-sessions/${focus.body.id}/finish`)
        .set('Origin', origin)
        .set('X-CSRF-Token', b.csrf)
        .expect(404)
    },
  )

  it('allows only one active focus session per user under concurrent requests', async () => {
    const owner = await actor()
    const start = () =>
      owner.agent
        .post('/api/focus-sessions')
        .set('Origin', origin)
        .set('X-CSRF-Token', owner.csrf)
        .send({ title: 'Foco concorrente' })
    const results = await Promise.all([start(), start()])
    expect(results.map((result) => result.status).sort()).toEqual([201, 409])
    const sessions = await owner.agent.get('/api/focus-sessions').expect(200)
    expect(sessions.body).toHaveLength(1)
  })

  it('protects attachment reads and references, including reassignment', async () => {
    const a = await actor()
    const b = await actor()
    const c = await actor()
    const upload = await a.agent
      .post('/api/agenda-items/uploads')
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .attach('files', Buffer.from('Private test document'), 'document.txt')
      .expect(201)
    const file = upload.body[0] as { name: string; url: string }
    await a.agent
      .get(`/api${file.url}`)
      .expect(200)
      .expect('X-Content-Type-Options', 'nosniff')
      .expect('Cache-Control', 'private, no-store')
      .expect('Content-Security-Policy', "default-src 'none'; sandbox")
      .expect('Content-Disposition', /^attachment; filename="[a-f0-9-]+\.txt"$/)
    await request(app.getHttpServer()).get(`/api${file.url}`).expect(401)
    await c.agent.get(`/api${file.url}`).expect(404)
    const ref = `${file.name}||${file.url}`
    await c.agent
      .post('/api/tasks')
      .set('Origin', origin)
      .set('X-CSRF-Token', c.csrf)
      .send({
        title: 'Inválida',
        category: 'Pessoal',
        color: 'blue',
        estimatedTime: 1,
        attachments: [ref],
      })
      .expect(400)
    await a.agent
      .post('/api/tasks')
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .send({
        title: 'Só o nome',
        category: 'Pessoal',
        color: 'blue',
        estimatedTime: 1,
        attachments: [file.name],
      })
      .expect(400)
    const created = await task(a, {
      assignedToId: b.user.id,
      attachments: [ref],
    })
    await b.agent.get(`/api${file.url}`).expect(200)
    await patch(a, created.id, { assignedToId: c.user.id }).expect(200)
    await b.agent.get(`/api${file.url}`).expect(404)
    await c.agent.get(`/api${file.url}`).expect(200)
    await a.agent.get(`/api/uploads/agenda/../other.txt`).expect(404)
  })

  it('uses the same persistent session on a second API instance', async () => {
    const user = await actor()
    const other = await createApplication()
    try {
      await other.init()
      const result = await request(other.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', user.cookie)
        .expect(200)
      expect(result.body.user.id).toBe(user.user.id)
    } finally {
      await other.close()
    }
  })

  it('sets Secure, HttpOnly and __Host cookies behind the production TLS proxy', async () => {
    const oldVercel = process.env.VERCEL
    const oldNode = process.env.NODE_ENV
    process.env.VERCEL = '1'
    process.env.NODE_ENV = 'production'
    const secured = await createApplication()
    try {
      await secured.init()
      const result = await request(secured.getHttpServer())
        .get('/api/auth/csrf')
        .set('X-Forwarded-Proto', 'https')
        .expect(200)
      const cookie = cookieHeaders(result)
      expect(cookie).toContain('__Host-colabora.sid=')
      expect(cookie).toMatch(/; Secure/)
      expect(cookie).toMatch(/; HttpOnly/)
      expect(cookie).toContain('Path=/')
      expect(cookie).not.toMatch(/Domain=/i)
    } finally {
      await secured.close()
      if (oldVercel === undefined) delete process.env.VERCEL
      else process.env.VERCEL = oldVercel
      process.env.NODE_ENV = oldNode
    }
  })

  it('requires explicit administrative identity matching to link legacy data', async () => {
    const owner = await actor()
    await expect(
      assignLegacy(source, owner.user.id, 'different@example.test'),
    ).rejects.toThrow('Confirme a identidade')
    const [before] = await source.query(
      'SELECT "createdById" FROM tasks WHERE title = $1',
      ['Legacy private'],
    )
    expect(before.createdById).toBeNull()
    const counts = await assignLegacy(source, owner.user.id, owner.user.email)
    expect(counts.tasks).toBe(1)
    const result = await owner.agent.get('/api/tasks').expect(200)
    expect(
      result.body.some(
        (item: { title: string }) => item.title === 'Legacy private',
      ),
    ).toBe(true)
    expect(
      (await assignLegacy(source, owner.user.id, owner.user.email)).tasks,
    ).toBe(0)
  })

  it('rejects cross-tab identity confusion without trusting the claimed identity', async () => {
    const a = await actor()
    const b = await actor()
    await a.agent.get('/api/tasks').set('X-Session-User', b.user.id).expect(409)
    await a.agent.get('/api/tasks').set('X-Session-User', a.user.id).expect(200)
  })

  it('prunes only expired security metadata without deleting valid sessions or users', async () => {
    const active = await actor()
    const expiredKey = 'e'.repeat(64)
    await source.query(
      `INSERT INTO auth_rate_limits (key, hits, "resetAt") VALUES ($1, 1, now() - interval '1 hour')`,
      [expiredKey],
    )
    await source.query(
      `INSERT INTO revoked_sessions (id, "expiresAt") VALUES ($1, now() - interval '1 hour')`,
      [expiredKey],
    )
    await source.query(
      `INSERT INTO app_sessions (sid, sess, expire) VALUES ('expired-test', '{}', now() - interval '1 hour')`,
    )
    await request(app.getHttpServer()).get('/api/auth/csrf').expect(200)
    expect(
      await source.query('SELECT key FROM auth_rate_limits WHERE key = $1', [
        expiredKey,
      ]),
    ).toEqual([])
    expect(
      await source.query('SELECT id FROM revoked_sessions WHERE id = $1', [
        expiredKey,
      ]),
    ).toEqual([])
    expect(
      await source.query(
        "SELECT sid FROM app_sessions WHERE sid = 'expired-test'",
      ),
    ).toEqual([])
    await active.agent.get('/api/auth/me').expect(200)
    expect(
      await source.query('SELECT id FROM users WHERE id = $1', [
        active.user.id,
      ]),
    ).toHaveLength(1)
  })

  it('rate limits anonymous session creation without storing rejected sessions', async () => {
    process.env.AUTH_CSRF_LIMIT = '1'
    const [before] = await source.query(
      'SELECT count(*)::int AS count FROM app_sessions',
    )
    try {
      await request(app.getHttpServer()).get('/api/auth/csrf').expect(429)
      const [after] = await source.query(
        'SELECT count(*)::int AS count FROM app_sessions',
      )
      expect(after.count).toBe(before.count)
    } finally {
      process.env.AUTH_CSRF_LIMIT = '1000'
    }
  })

  it('keeps profile photos private and deletes the previous file', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const a = await actor()
    const b = await actor()
    expect(a.user).toMatchObject({ avatar: null })
    await request(app.getHttpServer()).get('/api/users/me/avatar').expect(401)
    const uploaded = await a.agent
      .post('/api/users/me/avatar')
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .attach('file', png, 'foto.png')
      .expect(201)
    expect(uploaded.body.user.avatar).toEqual({
      kind: 'image',
      revision: expect.stringMatching(/^[0-9a-f]{16}$/),
    })
    expect(JSON.stringify(uploaded.body)).not.toContain('avatars/')
    const folder = join(uploadDir, 'avatars', a.user.id)
    expect(await readdir(folder)).toHaveLength(1)
    await a.agent
      .get('/api/users/me/avatar')
      .expect(200)
      .expect('Content-Type', /image\/png/)
      .expect('X-Content-Type-Options', 'nosniff')
      .expect('Cache-Control', 'private, no-store')
      .expect('Content-Disposition', 'inline; filename="avatar.png"')
    await b.agent.get('/api/users/me/avatar').expect(404)
    await a.agent
      .post('/api/users/me/avatar')
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .attach('file', Buffer.from('not an image'), 'foto.png')
      .expect(400)
    expect(await readdir(folder)).toHaveLength(1)
    const preset = await a.agent
      .patch('/api/users/me/avatar')
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .send({ preset: 'leaf' })
      .expect(200)
    expect(preset.body.user.avatar).toEqual({ kind: 'preset', id: 'leaf' })
    await a.agent.get('/api/users/me/avatar').expect(404)
    expect(await readdir(folder)).toEqual([])
    const removed = await a.agent
      .delete('/api/users/me/avatar')
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .expect(200)
    expect(removed.body.user.avatar).toBeNull()
    const me = await a.agent.get('/api/auth/me').expect(200)
    expect(me.body.user.avatar).toBeNull()
  })

  it('shows the assigned profile photo only to task participants and follows reassignment', async () => {
    const owner = await actor('Criador')
    const assignee = await actor('Responsável')
    const outsider = await actor('Outra pessoa')
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    await assignee.agent
      .post('/api/users/me/avatar')
      .set('Origin', origin)
      .set('X-CSRF-Token', assignee.csrf)
      .attach('file', png, 'foto.png')
      .expect(201)
    const directory = await owner.agent
      .get(`/api/users?query=${encodeURIComponent(assignee.user.email)}`)
      .expect(200)
    expect(directory.body).toEqual([
      expect.objectContaining({
        id: assignee.user.id,
        avatar: { kind: 'image', revision: expect.any(String) },
      }),
    ])
    expect(JSON.stringify(directory.body)).not.toContain('avatarKey')
    expect(JSON.stringify(directory.body)).not.toContain('avatars/')
    const directoryPhoto = `/api/users/directory/${assignee.user.id}/avatar`
    await request(app.getHttpServer()).get(directoryPhoto).expect(401)
    await owner.agent
      .get(directoryPhoto)
      .expect(200)
      .expect('Content-Type', /image\/png/)
      .expect('Cache-Control', 'private, no-store')
    const shared = await task(owner, { assignedToId: assignee.user.id })
    const detail = await owner.agent.get(`/api/tasks/${shared.id}`).expect(200)
    expect(detail.body.assignedTo).toMatchObject({
      id: assignee.user.id,
      avatar: { kind: 'image', revision: expect.any(String) },
    })
    expect(JSON.stringify(detail.body)).not.toContain('avatarKey')
    expect(JSON.stringify(detail.body)).not.toContain('avatars/')
    const path = `/api/tasks/${shared.id}/assignee/avatar`
    await request(app.getHttpServer()).get(path).expect(401)
    await outsider.agent.get(path).expect(404)
    await owner.agent
      .get(path)
      .expect(200)
      .expect('Content-Type', /image\/png/)
      .expect('Cache-Control', 'private, no-store')
    await assignee.agent.get(path).expect(200)
    await patch(owner, shared.id, { assignedToId: outsider.user.id }).expect(
      200,
    )
    await assignee.agent.get(path).expect(404)
    await owner.agent.get(path).expect(404)
  })

  it('persists task kind, finish time and cleared schedules for the details view', async () => {
    const owner = await actor()
    const timed = await task(owner, { startImmediately: true })
    const started = await owner.agent.get(`/api/tasks/${timed.id}`).expect(200)
    expect(started.body).toMatchObject({
      timed: true,
      completedAt: null,
      dueDate: null,
    })
    const finished = await owner.agent
      .post(`/api/tasks/${timed.id}/complete`)
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .send({})
      .expect(200)
    expect(finished.body.task).toMatchObject({
      timed: true,
      status: 'completed',
      completedAt: expect.any(String),
    })
    const reopened = await owner.agent
      .patch(`/api/tasks/${timed.id}/status`)
      .set('Origin', origin)
      .set('X-CSRF-Token', owner.csrf)
      .send({ status: 'pending' })
      .expect(200)
    expect(reopened.body).toMatchObject({
      timed: true,
      completedAt: null,
      startedAt: null,
    })
    const scheduled = await task(owner, { dueDate: '2026-11-07T12:00:00.000Z' })
    const cleared = await patch(owner, scheduled.id, { dueDate: null }).expect(
      200,
    )
    expect(cleared.body).toMatchObject({ timed: false, dueDate: null })
  })

  it('rate limits repeated login guesses using shared database state', async () => {
    const client = await anonymous()
    const email = `${randomUUID()}@example.test`
    for (let count = 0; count < 3; count += 1)
      await client.agent
        .post('/api/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', client.csrf)
        .send({ email, password: 'wrong' })
        .expect(401)
    await client.agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', client.csrf)
      .send({ email, password: 'wrong' })
      .expect(429)
  })
})
