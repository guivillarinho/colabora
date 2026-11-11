import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'
import app from './reminders.ts'

const originalSecret = process.env.REMINDER_DISPATCH_SECRET
const originalUrl = process.env.COLABORA_API_URL
beforeEach(() => {
  process.env.REMINDER_DISPATCH_SECRET = 'test-secret'
  process.env.COLABORA_API_URL = 'https://example.com/'
})
afterEach(() => {
  mock.restoreAll()
  if (originalSecret === undefined) delete process.env.REMINDER_DISPATCH_SECRET
  else process.env.REMINDER_DISPATCH_SECRET = originalSecret
  if (originalUrl === undefined) delete process.env.COLABORA_API_URL
  else process.env.COLABORA_API_URL = originalUrl
})
const invoke = () =>
  app.request('/', {
    method: 'POST',
    headers: { 'x-neon-trigger-invocation-id': 'test-invocation' },
  })

test('rejects requests outside the scheduler before calling the API', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected request')
  })
  assert.equal((await app.request('/', { method: 'POST' })).status, 403)
  assert.equal(fetch.mock.calls.length, 0)
})
test('authenticates with the API and returns the dispatcher result', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () =>
    Response.json({ delivered: 1 }),
  )
  const response = await invoke()
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { delivered: 1 })
  assert.equal(fetch.mock.calls.length, 2)
  const [url, options] = fetch.mock.calls[0].arguments as unknown as [
    string,
    RequestInit,
  ]
  const [googleUrl] = fetch.mock.calls[1].arguments as unknown as [string]
  assert.equal(url, 'https://example.com/api/notifications/dispatch-reminders')
  assert.equal(googleUrl, 'https://example.com/api/google/jobs/tick')
  assert.equal(options.method, 'POST')
  assert.equal(
    new Headers(options.headers).get('authorization'),
    'Bearer test-secret',
  )
})
test('reports a failed API response for the scheduler to retry', async () => {
  mock.method(globalThis, 'fetch', async () =>
    Response.json({ message: 'Unauthorized' }, { status: 401 }),
  )
  assert.equal((await invoke()).status, 502)
})
test('reports timeout and network failures for the scheduler to retry', async () => {
  mock.method(globalThis, 'fetch', async () => {
    throw new Error('Network failure')
  })
  assert.equal((await invoke()).status, 502)
})
