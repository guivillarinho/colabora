import { GoogleCalendarClient } from './google-calendar.client'

const response = (status: number, body: unknown = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response

beforeEach(() => {
  global.fetch = jest.fn()
})

it('retries an event insert when the stable id is not found and a concurrent insert conflicts', async () => {
  const client = new GoogleCalendarClient()
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(response(404))
    .mockResolvedValueOnce(response(409))
    .mockResolvedValueOnce(response(200, { etag: '1' }))
  const result = await client.upsert('token', 'primary', 'a'.repeat(64), {
    summary: 'Reunião',
    start: { dateTime: '2026-11-06T12:00:00.000Z' },
    end: { dateTime: '2026-11-06T13:00:00.000Z' },
  })
  expect(result.status).toBe(200)
  const methods = jest.mocked(fetch).mock.calls.map((call) => call[1]?.method)
  expect(methods).toEqual(['PUT', 'POST', 'PUT'])
})
