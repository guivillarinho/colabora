import type { Identity } from './entities/user.entity'

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string
    authStartedAt?: number
    authLastSeenAt?: number
  }
}

export type SessionResponse = { user: Identity; csrfToken: string }
