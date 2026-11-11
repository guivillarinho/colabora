import { apiRequest } from '@/lib/http-client'

export type GooglePreferences = {
  autoSync: boolean
  inboundEnabled: boolean
  defaultCalendarId: string
  categoryTaskListMap: Record<string, string>
}

export type GoogleLink = {
  entityType: string
  entityId: string
  googleKind: string
  syncState: string
  syncedAt: string
}

export type GoogleStatus = {
  configured: boolean
  status: string
  email?: string | null
  synced: Array<{ taskId: string; syncedAt: string }>
  links?: GoogleLink[]
  preferences?: GooglePreferences
  lastError?: { code?: string; message?: string } | null
}

export const defaultGooglePreferences: GooglePreferences = {
  autoSync: false,
  inboundEnabled: false,
  defaultCalendarId: 'primary',
  categoryTaskListMap: {},
}

export function googleStatus() {
  return apiRequest<GoogleStatus>('/google/status')
}

export function googleConnect() {
  return apiRequest<{ url: string }>('/google/connect', { method: 'POST' })
}

export function googleDisconnect() {
  return apiRequest('/google/disconnect', { method: 'POST' })
}

export function saveGooglePreferences(preferences: GooglePreferences) {
  return apiRequest('/google/preferences', {
    method: 'PATCH',
    body: JSON.stringify(preferences),
  })
}

export function googleCalendars() {
  return apiRequest<Array<{ id: string; summary: string; primary: boolean }>>(
    '/google/calendars',
  )
}

export function googleTasklists() {
  return apiRequest<Array<{ id: string; title: string }>>('/google/tasklists')
}
