import type { Identity } from './entities/user.entity'

declare module 'express-session' {
  interface SessionData {
    googleOAuth?: import('../google/google.service').OAuthPending
    csrfToken?: string
    authStartedAt?: number
    authLastSeenAt?: number
  }
}

export type SessionResponse = { user: Identity; csrfToken: string }
