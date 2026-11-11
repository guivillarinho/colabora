import { Inject, Injectable, forwardRef } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'

import { AgendaItem } from '../agenda/entities/agenda-item.entity'
import { Task } from '../tasks/entities/task.entity'
import { TaskStatus } from '../tasks/task-status.enum'
import { GoogleCalendarClient } from './google-calendar.client'
import { GoogleInboundService } from './google-inbound.service'
import { type GooglePreferences, googlePreferences } from './google-preferences'
import { GoogleService } from './google.service'
import { GoogleTasksClient } from './google-tasks.client'

const colors: Record<string, string> = {
  red: '11',
  blue: '9',
  yellow: '5',
  green: '10',
  purple: '3',
  orange: '6',
}

type OutboxRow = {
  id: string
  ownerId: string
  operation: string
  payload: Record<string, string>
  attempts: number
}

@Injectable()
export class GoogleSyncOrchestrator {
  constructor(
    private readonly source: DataSource,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => GoogleService))
    private readonly google: GoogleService,
    @Inject(forwardRef(() => GoogleInboundService))
    private readonly inbound: GoogleInboundService,
    private readonly tasks: GoogleTasksClient,
    private readonly calendar: GoogleCalendarClient,
  ) {}

  async enqueue(
    ownerId: string,
    operation: string,
    payload: Record<string, string>,
  ) {
    const prefs = await this.preferences(ownerId)
    if (!prefs) return
    if (operation.startsWith('pull') && !prefs.inboundEnabled) return
    if (operation === 'ensure-watch' && !prefs.inboundEnabled) return
    if (operation.startsWith('push') && !prefs.autoSync) return
    if (operation.startsWith('delete')) {
      const link = await this.link(
        ownerId,
        payload.entityType,
        payload.entityId,
      )
      if (!link) return
      payload = {
        ...payload,
        googleKind: link.googleKind,
        googleResourceId: link.googleResourceId,
        googleCalendarId: link.googleCalendarId ?? prefs.defaultCalendarId,
      }
    }
    await this.source.query(
      `INSERT INTO google_sync_outbox (id,"ownerId",operation,payload) VALUES ($1,$2,$3,$4::jsonb)`,
      [randomUUID(), ownerId, operation, JSON.stringify(payload)],
    )
    await this.drain()
  }

  async drain() {
    const rows = (await this.source.query(
      `SELECT id,"ownerId",operation,payload,attempts FROM google_sync_outbox
       WHERE "nextAttemptAt"<=now() ORDER BY "nextAttemptAt" LIMIT 5`,
    )) as OutboxRow[]
    for (const row of rows) {
      try {
        await this.dispatch(row)
        await this.source.query('DELETE FROM google_sync_outbox WHERE id=$1', [
          row.id,
        ])
      } catch (error) {
        const attempts = Number(row.attempts) + 1
        await this.source.query(
          `UPDATE google_sync_outbox SET attempts=$2,"lastError"=$3,"nextAttemptAt"=now()+make_interval(secs => $4) WHERE id=$1`,
          [
            row.id,
            attempts,
            error instanceof Error ? error.message.slice(0, 300) : 'Falha',
            Math.min(3600, 30 * attempts),
          ],
        )
        if (attempts >= 8) {
          await this.source.query(
            'DELETE FROM google_sync_outbox WHERE id=$1',
            [row.id],
          )
        }
      }
    }
  }

  async savePreferences(ownerId: string, prefs: GooglePreferences) {
    const rows = await this.source.query(
      'UPDATE google_connections SET preferences=$2::jsonb WHERE "ownerId"=$1 AND status=$3 RETURNING "ownerId"',
      [ownerId, JSON.stringify(prefs), 'connected'],
    )
    if (!rows[0]) return false
    if (prefs.inboundEnabled) await this.enqueue(ownerId, 'ensure-watch', {})
    else await this.stopWatches(ownerId)
    return true
  }

  async calendars(ownerId: string) {
    const access = await this.google.authorized(ownerId)
    const response = await this.calendar.listCalendars(access)
    if (!response.ok) throw new Error('Calendar')
    const body = (await response.json()) as {
      items?: Array<{ id?: string; summary?: string; primary?: boolean }>
    }
    return (body.items ?? [])
      .filter((item) => item.id)
      .map((item) => ({
        id: item.id as string,
        summary: item.summary ?? item.id,
        primary: item.primary === true,
      }))
  }

  async tasklists(ownerId: string) {
    const access = await this.google.authorized(ownerId)
    const response = await this.tasks.listLists(access)
    if (!response.ok) throw new Error('Tasks')
    const body = (await response.json()) as {
      items?: Array<{ id?: string; title?: string }>
    }
    return (body.items ?? [])
      .filter((item) => item.id)
      .map((item) => ({ id: item.id as string, title: item.title ?? item.id }))
  }

  async renewWatches() {
    const rows = await this.source.query(
      `SELECT c."ownerId", c.preferences FROM google_connections c
       WHERE c.status='connected'`,
    )
    const horizon = Date.now() + 24 * 60 * 60 * 1000
    for (const row of rows) {
      const prefs = googlePreferences(row.preferences)
      if (!prefs.inboundEnabled || !this.config.get('GOOGLE_WEBHOOK_URL'))
        continue
      const channels = await this.source.query(
        'SELECT expiration FROM google_watch_channels WHERE "ownerId"=$1 AND "calendarId"=$2',
        [row.ownerId, prefs.defaultCalendarId],
      )
      const expiration = channels[0]?.expiration
        ? new Date(channels[0].expiration).getTime()
        : 0
      if (expiration > horizon) continue
      await this.enqueue(row.ownerId, 'ensure-watch', {})
    }
  }

  async pollTasks() {
    const rows = await this.source.query(
      `SELECT "ownerId", preferences FROM google_connections WHERE status='connected'`,
    )
    for (const row of rows) {
      if (!googlePreferences(row.preferences).inboundEnabled) continue
      await this.enqueue(row.ownerId, 'pull-tasks', {})
    }
  }

  private async dispatch(row: OutboxRow) {
    const payload = row.payload ?? {}
    if (row.operation === 'push-task')
      await this.pushTask(row.ownerId, payload.taskId)
    else if (row.operation === 'push-agenda')
      await this.pushAgenda(row.ownerId, payload.agendaId)
    else if (
      row.operation === 'delete-task' ||
      row.operation === 'delete-agenda'
    )
      await this.deleteRemote(row.ownerId, payload)
    else if (row.operation === 'pull-calendar')
      await this.inbound.pullCalendar(
        row.ownerId,
        payload.calendarId || 'primary',
      )
    else if (row.operation === 'pull-tasks')
      await this.inbound.pullTasks(row.ownerId)
    else if (row.operation === 'ensure-watch')
      await this.ensureWatch(row.ownerId)
  }

  private async pushTask(ownerId: string, taskId: string) {
    const task = await this.task(taskId, ownerId)
    if (!task?.dueDate) return
    const prefs = await this.preferences(ownerId)
    if (!prefs) return
    const access = await this.google.authorized(ownerId)
    const existing = await this.link(ownerId, 'task', taskId)
    if (existing?.googleKind === 'event') {
      await this.calendar.remove(
        access,
        existing.googleCalendarId || 'primary',
        existing.googleResourceId,
      )
    }
    const listId = prefs.categoryTaskListMap[task.category] || '@default'
    const response = await this.tasks.upsert(
      access,
      listId,
      existing?.googleKind === 'task' ? existing.googleResourceId : null,
      {
        title: task.title,
        notes: `${task.description ?? ''}\n[colabora:${task.id}]`.trim(),
        due: new Date(task.dueDate).toISOString(),
        status:
          task.status === TaskStatus.Completed ? 'completed' : 'needsAction',
      },
    )
    if (!response.ok) throw new Error('Tasks')
    const body = (await response.json()) as { id?: string; etag?: string }
    if (!body.id) throw new Error('Tasks')
    await this.saveLink(
      ownerId,
      'task',
      task.id,
      'task',
      body.id,
      listId,
      body.etag ?? null,
      task.updatedAt,
    )
  }

  private async pushAgenda(ownerId: string, agendaId: string) {
    const item = await this.agenda(agendaId, ownerId)
    if (!item) return
    const prefs = await this.preferences(ownerId)
    if (!prefs) return
    const access = await this.google.authorized(ownerId)
    const eventId = createHash('sha256')
      .update(`colabora:${ownerId}:${item.id}`)
      .digest('hex')
    const response = await this.calendar.upsert(
      access,
      prefs.defaultCalendarId,
      eventId,
      {
        summary: item.title,
        description: item.description ?? '',
        location: item.location ?? undefined,
        start: { dateTime: new Date(item.startDate).toISOString() },
        end: { dateTime: new Date(item.endDate).toISOString() },
        colorId: item.type === 'project' ? colors.purple : colors.blue,
        extendedProperties: {
          private: {
            colaboraEntityId: item.id,
            colaboraEntityType: 'agenda_item',
          },
        },
      },
    )
    if (!response.ok) throw new Error('Calendar')
    const body = (await response.json()) as { etag?: string }
    await this.saveLink(
      ownerId,
      'agenda_item',
      item.id,
      'event',
      eventId,
      prefs.defaultCalendarId,
      body.etag ?? null,
      item.updatedAt,
    )
  }

  private async deleteRemote(ownerId: string, payload: Record<string, string>) {
    const access = await this.google.authorized(ownerId)
    if (payload.googleKind === 'task') {
      const response = await this.tasks.remove(
        access,
        payload.googleCalendarId || '@default',
        payload.googleResourceId,
      )
      if (!response.ok && response.status !== 404) throw new Error('Tasks')
    } else if (payload.googleResourceId) {
      const response = await this.calendar.remove(
        access,
        payload.googleCalendarId || 'primary',
        payload.googleResourceId,
      )
      if (!response.ok && response.status !== 404 && response.status !== 410)
        throw new Error('Calendar')
    }
    await this.source.query(
      'DELETE FROM google_sync_links WHERE "ownerId"=$1 AND "entityType"=$2 AND "entityId"=$3',
      [ownerId, payload.entityType, payload.entityId],
    )
  }

  private webhookUrl() {
    const explicit = this.config.get<string>('GOOGLE_WEBHOOK_URL')
    if (explicit) return explicit
    const app = this.config.get<string>('PUBLIC_APP_URL')
    if (!app) return ''
    return new URL('/api/google/webhook/calendar', app).toString()
  }

  private async ensureWatch(ownerId: string) {
    const address = this.webhookUrl()
    if (!address) return
    const prefs = await this.preferences(ownerId)
    if (!prefs) return
    const access = await this.google.authorized(ownerId)
    const current = await this.source.query(
      'SELECT "channelId","resourceId" FROM google_watch_channels WHERE "ownerId"=$1 AND "calendarId"=$2',
      [ownerId, prefs.defaultCalendarId],
    )
    if (current[0]?.resourceId) {
      await this.calendar.stop(
        access,
        current[0].channelId,
        current[0].resourceId,
      )
    }
    const channelId = randomUUID()
    const token = randomBytes(24).toString('base64url')
    const response = await this.calendar.watch(
      access,
      prefs.defaultCalendarId,
      {
        id: channelId,
        address,
        token,
      },
    )
    if (!response.ok) throw new Error('Watch')
    const body = (await response.json()) as {
      resourceId?: string
      expiration?: string
    }
    await this.source.query(
      `INSERT INTO google_watch_channels ("channelId","ownerId","calendarId","resourceId",token,expiration)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("ownerId","calendarId") DO UPDATE SET
        "channelId"=EXCLUDED."channelId",
        "resourceId"=EXCLUDED."resourceId",
        token=EXCLUDED.token,
        expiration=EXCLUDED.expiration`,
      [
        channelId,
        ownerId,
        prefs.defaultCalendarId,
        body.resourceId ?? null,
        token,
        body.expiration ? new Date(Number(body.expiration)) : null,
      ],
    )
  }

  private async stopWatches(ownerId: string) {
    const rows = await this.source.query(
      'SELECT "channelId","resourceId" FROM google_watch_channels WHERE "ownerId"=$1',
      [ownerId],
    )
    if (!rows.length) return
    try {
      const access = await this.google.authorized(ownerId)
      for (const row of rows) {
        if (row.resourceId)
          await this.calendar.stop(access, row.channelId, row.resourceId)
      }
    } catch {
      // A desconexão e a preferência local seguem mesmo se o Google não responder.
    }
    await this.source.query(
      'DELETE FROM google_watch_channels WHERE "ownerId"=$1',
      [ownerId],
    )
  }

  private async preferences(ownerId: string) {
    const rows = await this.source.query(
      'SELECT status,preferences FROM google_connections WHERE "ownerId"=$1',
      [ownerId],
    )
    if (!rows[0] || rows[0].status !== 'connected') return null
    return googlePreferences(rows[0].preferences)
  }

  private async link(ownerId: string, entityType: string, entityId: string) {
    const rows = await this.source.query(
      `SELECT "googleKind","googleResourceId","googleCalendarId" FROM google_sync_links
       WHERE "ownerId"=$1 AND "entityType"=$2 AND "entityId"=$3`,
      [ownerId, entityType, entityId],
    )
    return rows[0] as
      | {
          googleKind: string
          googleResourceId: string
          googleCalendarId: string | null
        }
      | undefined
  }

  private async task(id: string, ownerId: string) {
    const rows = await this.source.query(
      'SELECT * FROM tasks WHERE id=$1 AND "createdById"=$2',
      [id, ownerId],
    )
    return rows[0] as Task | undefined
  }

  private async agenda(id: string, ownerId: string) {
    const rows = await this.source.query(
      'SELECT * FROM agenda_items WHERE id=$1 AND "ownerId"=$2',
      [id, ownerId],
    )
    return rows[0] as AgendaItem | undefined
  }

  private async saveLink(
    ownerId: string,
    entityType: string,
    entityId: string,
    googleKind: string,
    googleResourceId: string,
    googleCalendarId: string,
    googleEtag: string | null,
    revision: Date | null,
  ) {
    await this.source.query(
      `INSERT INTO google_sync_links
        ("ownerId","entityType","entityId","googleKind","googleResourceId","googleCalendarId","googleEtag","colaboraRevision","syncState")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'synced')
       ON CONFLICT ("ownerId","entityType","entityId") DO UPDATE SET
        "googleKind"=EXCLUDED."googleKind",
        "googleResourceId"=EXCLUDED."googleResourceId",
        "googleCalendarId"=EXCLUDED."googleCalendarId",
        "googleEtag"=EXCLUDED."googleEtag",
        "colaboraRevision"=EXCLUDED."colaboraRevision",
        "syncState"='synced',
        "syncedAt"=now()`,
      [
        ownerId,
        entityType,
        entityId,
        googleKind,
        googleResourceId,
        googleCalendarId,
        googleEtag,
        revision,
      ],
    )
  }
}
