import { apiRequest } from '@/lib/http-client'
export type AuthUser = { id: string; name: string; email: string }
export type SessionResponse = { user: AuthUser; csrfToken: string }
export const authApi = {
  me: (signal?: AbortSignal) =>
    apiRequest<SessionResponse>('/auth/me', { signal }, false),
  login: (email: string, password: string) =>
    apiRequest<SessionResponse>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      false,
    ),
  register: (name: string, email: string, password: string) =>
    apiRequest<SessionResponse>(
      '/auth/register',
      { method: 'POST', body: JSON.stringify({ name, email, password }) },
      false,
    ),
  logout: async () => {
    if (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    ) {
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          try {
            await apiRequest<void>('/notifications/subscriptions', {
              method: 'DELETE',
              body: JSON.stringify({ endpoint: subscription.endpoint }),
            })
          } finally {
            await subscription.unsubscribe()
          }
        }
      } catch {
        // Preserve logout even if browser push cleanup or the network is unavailable.
      }
    }
    return apiRequest<void>('/auth/logout', { method: 'POST' })
  },
}
