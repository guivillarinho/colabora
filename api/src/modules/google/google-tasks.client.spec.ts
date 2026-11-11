import { GoogleTasksClient } from './google-tasks.client'

const response = (status: number, body: unknown = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response

beforeEach(() => {
  global.fetch = jest.fn()
})

it('updates an existing Google Task and creates one when the id disappeared', async () => {
  const client = new GoogleTasksClient()
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(response(404))
    .mockResolvedValueOnce(response(200, { id: 'new' }))
  const result = await client.upsert('token', '@default', 'missing', {
    title: 'Estudar',
    due: '2026-11-06T12:00:00.000Z',
    status: 'needsAction',
  })
  expect(result.status).toBe(200)
  expect(jest.mocked(fetch).mock.calls[0][1]?.method).toBe('PATCH')
  expect(jest.mocked(fetch).mock.calls[1][1]?.method).toBe('POST')
  expect(String(jest.mocked(fetch).mock.calls[1][0])).toContain(
    '/lists/%40default/tasks',
  )
})
