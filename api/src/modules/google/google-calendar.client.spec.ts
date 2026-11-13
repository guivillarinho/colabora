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
  expect(methods).toEqual(['PATCH', 'POST', 'PATCH'])
})

it('adds attachments to the original event with an ETag and preserves existing files', async () => {
  const client = new GoogleCalendarClient()
  const existing = {
    fileId: 'existing',
    fileUrl: 'https://drive.google.com/file/d/existing/view',
    title: 'Já estava no Google',
  }
  const added = {
    fileId: 'added',
    fileUrl: 'https://drive.google.com/file/d/added/view',
    mimeType: 'application/pdf',
    title: 'Documento.pdf',
  }
  const body = {
    summary: 'Reunião',
    start: { dateTime: '2026-11-06T12:00:00.000Z' },
    end: { dateTime: '2026-11-06T13:00:00.000Z' },
  }
  jest
    .mocked(fetch)
    .mockResolvedValueOnce(
      response(200, { etag: '1', attachments: [existing] }),
    )
    .mockResolvedValueOnce(response(200, { etag: '2' }))
    .mockResolvedValueOnce(
      response(200, { etag: '2', attachments: [existing, added] }),
    )

  await client.upsert('token', 'my/calendar', 'event/id', body, [added], true)
  const [read, write] = jest.mocked(fetch).mock.calls
  expect(read[0]).toBe(
    'https://www.googleapis.com/calendar/v3/calendars/my%2Fcalendar/events/event%2Fid',
  )
  expect(write[0]).toBe(`${read[0]}?sendUpdates=none&supportsAttachments=true`)
  expect(write[1]?.headers).toEqual(
    expect.objectContaining({ 'If-Match': '1' }),
  )
  expect(JSON.parse(String(write[1]?.body))).toEqual({
    attachments: [
      { fileUrl: existing.fileUrl, title: existing.title },
      { fileUrl: added.fileUrl, title: added.title, mimeType: added.mimeType },
    ],
  })

  await client.upsert('token', 'my/calendar', 'event/id', body, [added], true)
  expect(fetch).toHaveBeenCalledTimes(3)
})
