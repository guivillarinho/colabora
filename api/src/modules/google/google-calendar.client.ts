import { Injectable } from '@nestjs/common'

export type GoogleEventBody = {
  summary: string
  description?: string
  location?: string
  start: { dateTime: string }
  end: { dateTime: string }
  colorId?: string
  reminders?: {
    useDefault: boolean
    overrides: Array<{ method: 'popup'; minutes: number }>
  }
  extendedProperties?: { private: Record<string, string> }
}

@Injectable()
export class GoogleCalendarClient {
  private headers(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  listCalendars(token: string) {
    return this.request(
      token,
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    )
  }

  listEvents(
    token: string,
    calendarId: string,
    syncToken?: string | null,
    range?: { timeMin: string; timeMax: string },
    pageToken?: string,
  ) {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    )
    url.searchParams.set('showDeleted', 'true')
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('maxResults', '250')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    if (range) {
      url.searchParams.set('timeMin', range.timeMin)
      url.searchParams.set('timeMax', range.timeMax)
      url.searchParams.set('orderBy', 'startTime')
    } else if (syncToken) url.searchParams.set('syncToken', syncToken)
    return this.request(token, url.toString())
  }

  async upsert(
    token: string,
    calendarId: string,
    eventId: string,
    body: GoogleEventBody,
  ) {
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    const options = {
      headers: this.headers(token),
      redirect: 'error' as const,
      signal: AbortSignal.timeout(10000),
    }
    let response = await fetch(`${base}/${eventId}?sendUpdates=none`, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    })
    if (response.status === 404) {
      response = await fetch(`${base}?sendUpdates=none`, {
        ...options,
        method: 'POST',
        body: JSON.stringify({ id: eventId, ...body }),
      })
      if (response.status === 409) {
        response = await fetch(`${base}/${eventId}?sendUpdates=none`, {
          ...options,
          method: 'PUT',
          body: JSON.stringify(body),
        })
      }
    }
    return response
  }

  remove(token: string, calendarId: string, eventId: string) {
    return this.request(
      token,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=none`,
      { method: 'DELETE' },
    )
  }

  watch(
    token: string,
    calendarId: string,
    channel: { id: string; address: string; token: string },
  ) {
    return this.request(
      token,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
      {
        method: 'POST',
        body: JSON.stringify({
          id: channel.id,
          type: 'web_hook',
          address: channel.address,
          token: channel.token,
        }),
      },
    )
  }

  stop(token: string, channelId: string, resourceId: string) {
    return this.request(
      token,
      'https://www.googleapis.com/calendar/v3/channels/stop',
      {
        method: 'POST',
        body: JSON.stringify({ id: channelId, resourceId }),
      },
    )
  }

  private request(token: string, url: string, init: RequestInit = {}) {
    return fetch(url, {
      ...init,
      headers: { ...this.headers(token), ...(init.headers ?? {}) },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    })
  }
}
