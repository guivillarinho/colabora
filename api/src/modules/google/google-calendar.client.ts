import { Injectable } from '@nestjs/common'

export type GoogleEventAttachment = {
  fileId?: string
  fileUrl: string
  title?: string
  mimeType?: string
  iconLink?: string
}

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

function writableAttachment({
  fileUrl,
  title,
  mimeType,
  iconLink,
  fileId,
}: GoogleEventAttachment) {
  return { fileUrl, title, mimeType, iconLink: fileId ? undefined : iconLink }
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
    attachments: GoogleEventAttachment[] = [],
    attachmentsOnly = false,
  ) {
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    const event = `${base}/${encodeURIComponent(eventId)}`
    const query = 'sendUpdates=none'
    const attachmentQuery = `${query}&supportsAttachments=true`

    const patch = async () => {
      if (!attachments.length) {
        return this.request(token, `${event}?${query}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        })
      }

      // Read the live list before writing it because Calendar replaces arrays
      // in their entirety. If-Match protects edits made between these requests.
      const response = await this.request(token, event)
      if (!response.ok) return response
      const current = (await response.json()) as {
        etag?: string
        attachments?: GoogleEventAttachment[]
      }
      if (!current.etag)
        throw new Error('Versão do evento Google indisponível.')
      const merged = [...(current.attachments ?? [])]
      let changed = false
      for (const attachment of attachments) {
        if (
          merged.some(
            (existing) =>
              (existing.fileId && existing.fileId === attachment.fileId) ||
              existing.fileUrl === attachment.fileUrl,
          )
        )
          continue
        merged.push(attachment)
        changed = true
      }
      if (!changed && attachmentsOnly)
        return Response.json({ etag: current.etag })
      if (merged.length > 25)
        throw new Error(
          'O evento atingiu o limite de 25 anexos do Google Agenda.',
        )
      return this.request(token, `${event}?${attachmentQuery}`, {
        method: 'PATCH',
        headers: { 'If-Match': current.etag },
        body: JSON.stringify({
          ...(!attachmentsOnly && body),
          attachments: merged.map(writableAttachment),
        }),
      })
    }

    let response = await patch()
    if (response.status === 404 && !attachmentsOnly) {
      response = await this.request(
        token,
        `${base}?${attachments.length ? attachmentQuery : query}`,
        {
          method: 'POST',
          body: JSON.stringify({
            id: eventId,
            ...body,
            ...(attachments.length && {
              attachments: attachments.map(writableAttachment),
            }),
          }),
        },
      )
      if (response.status === 409) response = await patch()
    }
    return response
  }

  remove(token: string, calendarId: string, eventId: string) {
    return this.request(
      token,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
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
