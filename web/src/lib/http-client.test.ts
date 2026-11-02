import {
  acceptHttpSession,
  apiRequest,
  clearHttpSession,
  HttpError,
  sessionExpiredEvent,
} from './http-client'
beforeEach(() => {
  clearHttpSession()
  globalThis.fetch = jest.fn()
})
it('sends cookies and CSRF without persisting credentials in browser storage', async () => {
  const mock = jest.mocked(fetch)
  mock
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ csrfToken: 'random-csrf' }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'task' }),
    } as Response)
  await apiRequest('/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: 'Teste' }),
  })
  const init = mock.mock.calls[1][1]!
  expect(init.credentials).toBe('include')
  expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('random-csrf')
  expect(localStorage.getItem('token')).toBeNull()
  expect(sessionStorage.getItem('token')).toBeNull()
})
it('expires the current UI session on private 401', async () => {
  acceptHttpSession('csrf')
  jest.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status: 401,
    json: async () => ({ message: 'Sessão expirada.' }),
  } as Response)
  const listener = jest.fn()
  window.addEventListener(sessionExpiredEvent, listener)
  await expect(apiRequest('/tasks')).rejects.toBeInstanceOf(HttpError)
  expect(listener).toHaveBeenCalledTimes(1)
  window.removeEventListener(sessionExpiredEvent, listener)
})
it('reports forbidden actions without expiring a valid session', async () => {
  jest.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status: 403,
    json: async () => ({ message: 'Sem permissão.' }),
  } as Response)
  const listener = jest.fn()
  window.addEventListener(sessionExpiredEvent, listener)
  await expect(apiRequest('/tasks/other')).rejects.toMatchObject({
    status: 403,
    message: 'Sem permissão.',
  })
  expect(listener).not.toHaveBeenCalled()
  window.removeEventListener(sessionExpiredEvent, listener)
})
it('ignores a stale 401 after switching to a new account', async () => {
  let finish!: (response: Response) => void
  jest.mocked(fetch).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const listener = jest.fn()
  window.addEventListener(sessionExpiredEvent, listener)
  const old = apiRequest('/tasks')
  acceptHttpSession('new-account-csrf')
  finish({
    ok: false,
    status: 401,
    json: async () => ({ message: 'Old session' }),
  } as Response)
  await expect(old).rejects.toBeInstanceOf(HttpError)
  expect(listener).not.toHaveBeenCalled()
  window.removeEventListener(sessionExpiredEvent, listener)
})

it('does not send a pending mutation after the account changes during CSRF acquisition', async () => {
  let finish!: (response: Response) => void
  jest.mocked(fetch).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const pending = apiRequest('/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: 'Old account' }),
  })
  acceptHttpSession('new-csrf', 'new-user')
  finish({
    ok: true,
    json: async () => ({ csrfToken: 'old-csrf' }),
  } as Response)
  await expect(pending).rejects.toMatchObject({ status: 409 })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('clears private UI when the server detects a different account in another tab', async () => {
  acceptHttpSession('csrf', 'expected-user')
  jest.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status: 409,
    json: async () => ({
      code: 'session_changed',
      message: 'A conta mudou.',
    }),
  } as Response)
  const listener = jest.fn()
  window.addEventListener(sessionExpiredEvent, listener)
  await expect(apiRequest('/tasks')).rejects.toMatchObject({ status: 409 })
  expect(
    new Headers(jest.mocked(fetch).mock.calls[0][1]?.headers).get(
      'X-Session-User',
    ),
  ).toBe('expected-user')
  expect(listener).toHaveBeenCalledTimes(1)
  window.removeEventListener(sessionExpiredEvent, listener)
})

it('refreshes the anonymous CSRF session once after an expired cookie is cleared', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValueOnce({ ok: false, status: 401 } as Response)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ csrfToken: 'fresh-csrf' }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response)
  await expect(
    apiRequest('/auth/login', { method: 'POST', body: '{}' }, false),
  ).resolves.toEqual({ ok: true })
  expect(fetch).toHaveBeenCalledTimes(3)
})
