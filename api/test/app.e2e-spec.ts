import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assignLegacy } from '../src/database/assign-legacy'
import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { Client } from 'pg'
import { DataSource } from 'typeorm'
import { randomBytes, randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { createApplication } from '../src/bootstrap'
import { InitialSchema1793448000000 } from '../src/database/migrations/1793448000000-initial-schema'

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

  it('keeps the existing health check public', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200, { status: 'ok' })
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
      changeStatus: true,
    })
    expect(visible.body.createdBy).toEqual({ id: a.user.id, name: a.user.name })
    expect(visible.body.createdBy).not.toHaveProperty('email')
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
    await patch(a, created.id, { assignedToId: c.user.id }).expect(200)
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
    await a.agent
      .delete(`/api/tasks/${created.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .expect(204)
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

  it('limits the user directory to public fields and bounded searches', async () => {
    const user = await actor('Directory')
    await user.agent.get('/api/users?query=a').expect(400)
    const result = await user.agent
      .get(`/api/users?query=${encodeURIComponent(user.user.email)}`)
      .expect(200)
    expect(result.body).toEqual([{ id: user.user.id, name: user.user.name }])
    expect(result.body.length).toBeLessThanOrEqual(10)
  })

  it('isolates agenda and focus sessions by owner', async () => {
    const a = await actor()
    const b = await actor()
    const item = await a.agent
      .post('/api/agenda-items')
      .set('Origin', origin)
      .set('X-CSRF-Token', a.csrf)
      .send({
        title: 'Privado',
        type: 'event',
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
  })

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
