declare const process: { env: { VITE_API_URL?: string } }
const configuredBase = (
  process.env.VITE_API_URL ?? 'http://localhost:3000'
).replace(/\/$/, '')
export const apiBase = configuredBase.endsWith('/api')
  ? configuredBase
  : `${configuredBase}/api`
export const sessionExpiredEvent = 'colabora:session-expired'
let csrfToken: string | null = null
let csrfRequest: Promise<string> | null = null
let epoch = 0
let expectedUserId: string | null = null

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function clearHttpSession() {
  epoch += 1
  csrfToken = null
  csrfRequest = null
  expectedUserId = null
}
export function acceptHttpSession(token: string, userId?: string) {
  clearHttpSession()
  csrfToken = token
  expectedUserId = userId ?? null
}

export async function getCsrfToken(signal?: AbortSignal): Promise<string> {
  if (csrfToken) return csrfToken
  if (signal?.aborted)
    throw new DOMException('The operation was aborted.', 'AbortError')
  if (!csrfRequest) {
    const current = epoch
    csrfRequest = (async () => {
      let response = await fetch(`${apiBase}/auth/csrf`, {
        credentials: 'include',
        cache: 'no-store',
        signal,
      })
      if (response.status === 401)
        response = await fetch(`${apiBase}/auth/csrf`, {
          credentials: 'include',
          cache: 'no-store',
          signal,
        })
      if (!response.ok)
        throw new HttpError(
          response.status,
          'Não foi possível preparar uma sessão segura. Atualize a página.',
        )
      const data = (await response.json()) as { csrfToken: string }
      if (epoch === current) csrfToken = data.csrfToken
      return data.csrfToken
    })().finally(() => {
      if (epoch === current) csrfRequest = null
    })
  }
  return csrfRequest
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  authFailure = true,
): Promise<T> {
  const current = epoch
  const headers = new Headers(init.headers)
  if (expectedUserId) headers.set('X-Session-User', expectedUserId)
  if (init.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(init.method?.toUpperCase() ?? 'GET'))
    headers.set('X-CSRF-Token', await getCsrfToken(init.signal ?? undefined))
  if (current !== epoch)
    throw new HttpError(409, 'A sessão mudou. Tente novamente.')
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  })
  if (response.status === 204) return undefined as T
  if (!response.ok) {
    if (response.status === 401 && authFailure && current === epoch) {
      clearHttpSession()
      window.dispatchEvent(new Event(sessionExpiredEvent))
    }
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[]
      code?: string
    } | null
    if (
      response.status === 409 &&
      body?.code === 'session_changed' &&
      current === epoch
    ) {
      clearHttpSession()
      window.dispatchEvent(new Event(sessionExpiredEvent))
    }
    const message = Array.isArray(body?.message)
      ? body.message.join(' ')
      : body?.message
    throw new HttpError(
      response.status,
      response.status >= 500
        ? 'O serviço está indisponível. Tente novamente.'
        : message ||
            (response.status === 403
              ? 'Você não tem permissão para esta ação.'
              : 'Não foi possível concluir a solicitação.'),
    )
  }
  return response.json() as Promise<T>
}
