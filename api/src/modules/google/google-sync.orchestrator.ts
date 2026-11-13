import { Inject, Injectable, forwardRef } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'

import { AgendaItem } from '../agenda/entities/agenda-item.entity'
import { Task } from '../tasks/entities/task.entity'
import { TaskStatus } from '../tasks/task-status.enum'
import { GoogleCalendarClient } from './google-calendar.client'
import { GoogleDriveAttachmentsService } from './google-drive-attachments.service'
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
    private readonly drive: GoogleDriveAttachmentsService,
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
    const needsAutoSync =
      operation.startsWith('push') ||
      operation === 'move-task-list' ||
      operation.endsWith('-category-list')
    if (needsAutoSync && !prefs.autoSync) return
    if (operation.startsWith('delete')) {
      const link = await this.link(
        ownerId,
        payload.entityType,
        payload.entityId,
      )
      const event =
        operation === 'delete-task'
          ? await this.link(ownerId, 'task_event', payload.entityId)
          : undefined
      if (!link && !event) return
      payload = {
        ...payload,
        googleKind: link?.googleKind ?? '',
        googleResourceId: link?.googleResourceId ?? '',
        googleCalendarId: link?.googleCalendarId ?? prefs.defaultCalendarId,
        ...(event && {
          taskEventId: event.googleResourceId,
          taskEventCalendar: event.googleCalendarId ?? 'primary',
        }),
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

  async syncNow(ownerId: string) {
    const current = await this.preferences(ownerId)
    if (!current) return { ok: false as const }
    if (!current.inboundEnabled) {
      const saved = await this.savePreferences(ownerId, {
        ...current,
        inboundEnabled: true,
      })
      if (!saved) return { ok: false as const }
    }
    const listed = await this.calendars(ownerId).catch(() => [])
    const calendarIds = new Set<string>(['primary'])
    for (const calendar of listed) calendarIds.add(calendar.id)
    for (const calendarId of calendarIds) {
      await this.inbound.pullCalendar(ownerId, calendarId, {
        force: true,
        window: true,
      })
    }
    await this.inbound.pullTaskLists(ownerId, { force: true })
    await this.inbound.pullTasks(ownerId, { force: true, full: true })
    return { ok: true as const }
  }

  calendarLinks(
    ownerId: string,
  ): Promise<
    Array<{ entityType: string; entityId: string; googleCalendarId: string }>
  > {
    return this.source.query(
      `SELECT CASE WHEN "entityType"='task_event' THEN 'task' ELSE "entityType" END AS "entityType",
        "entityId","googleCalendarId" FROM google_sync_links
       WHERE "ownerId"=$1 AND "googleKind"='event' AND "googleCalendarId" IS NOT NULL`,
      [ownerId],
    )
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
      await this.enqueue(row.ownerId, 'pull-task-lists', {})
    }
  }

  private async dispatch(row: OutboxRow) {
    const payload = row.payload ?? {}
    if (row.operation === 'push-task') {
      if (payload.target !== 'calendar')
        await this.pushTask(row.ownerId, payload.taskId)
    } else if (row.operation === 'push-agenda')
      await this.pushAgenda(
        row.ownerId,
        payload.agendaId,
        payload.attachmentsOnly === 'true',
      )
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
    else if (row.operation === 'pull-task-lists')
      await this.inbound.pullTaskLists(row.ownerId)
    else if (row.operation === 'push-category-list')
      await this.pushCategoryList(row.ownerId, payload.categoryId)
    else if (row.operation === 'update-category-list')
      await this.updateCategoryList(row.ownerId, payload.categoryId)
    else if (row.operation === 'delete-category-list')
      await this.deleteCategoryList(row.ownerId, payload.categoryId)
    else if (row.operation === 'move-task-list')
      await this.moveTaskList(row.ownerId, payload.taskId)
    else if (row.operation === 'ensure-watch')
      await this.ensureWatch(row.ownerId)
  }

  private async pushTask(ownerId: string, taskId: string) {
    const task = await this.task(taskId, ownerId)
    if (!task) return
    const prefs = await this.preferences(ownerId)
    if (!prefs) return
    const access = await this.google.authorized(ownerId)
    const existing = await this.link(ownerId, 'task', taskId)
    if (existing?.googleKind === 'event') {
      await this.saveLink(
        ownerId,
        'task_event',
        task.id,
        'event',
        existing.googleResourceId,
        existing.googleCalendarId ?? 'primary',
        null,
        task.updatedAt,
      )
    }
    const listId = await this.resolveListIdForCategory(
      ownerId,
      task.categoryId,
      task.category,
      prefs,
      access,
    )
    const response = await this.tasks.upsert(
      access,
      listId,
      existing?.googleKind === 'task' ? existing.googleResourceId : null,
      {
        title: task.title,
        notes: `${task.description ?? ''}\n[colabora:${task.id}]`.trim(),
        due: task.dueDate ? new Date(task.dueDate).toISOString() : null,
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

  private async resolveListIdForCategory(
    ownerId: string,
    categoryId: string | null | undefined,
    categoryName: string | null | undefined,
    prefs: GooglePreferences,
    access: string,
  ): Promise<string> {
    if (categoryId) {
      const rows = await this.source.query(
        `SELECT "googleListId",name,"syncState" FROM task_categories
         WHERE id=$1 AND "ownerId"=$2 AND "deletedAt" IS NULL`,
        [categoryId, ownerId],
      )
      const row = rows[0] as
        { googleListId?: string; name?: string; syncState?: string } | undefined
      if (row?.googleListId) return row.googleListId
      if (row?.name) {
        const created = await this.tasks.createList(access, row.name)
        if (created.ok) {
          const body = (await created.json()) as { id?: string; etag?: string }
          if (body.id) {
            await this.source.query(
              `UPDATE task_categories SET "googleListId"=$3,"googleEtag"=$4,"syncState"='synced',"updatedAt"=now()
               WHERE id=$1 AND "ownerId"=$2`,
              [categoryId, ownerId, body.id, body.etag ?? null],
            )
            return body.id
          }
        }
      }
    }

    const trimmed = (categoryName || '').trim()
    if (!trimmed) return '@default'

    if (prefs.categoryTaskListMap[trimmed])
      return prefs.categoryTaskListMap[trimmed]
    for (const [name, id] of Object.entries(prefs.categoryTaskListMap)) {
      if (name.toLowerCase() === trimmed.toLowerCase()) return id
    }

    const lists = await this.tasklists(ownerId)
    const matched = lists.find(
      (list) =>
        (list.title || '').trim().toLowerCase() === trimmed.toLowerCase(),
    )
    if (matched?.id) return matched.id

    return '@default'
  }

  private async pushCategoryList(ownerId: string, categoryId: string) {
    const rows = await this.source.query(
      `SELECT name,"googleListId" FROM task_categories WHERE id=$1 AND "ownerId"=$2 AND "deletedAt" IS NULL`,
      [categoryId, ownerId],
    )
    const row = rows[0] as { name?: string; googleListId?: string } | undefined
    if (!row?.name) return
    if (row.googleListId) return
    const access = await this.google.authorized(ownerId)
    const response = await this.tasks.createList(access, row.name)
    if (!response.ok) throw new Error('Tasks')
    const body = (await response.json()) as { id?: string; etag?: string }
    if (!body.id) throw new Error('Tasks')
    await this.source.query(
      `UPDATE task_categories SET "googleListId"=$3,"googleEtag"=$4,"syncState"='synced',"updatedAt"=now()
       WHERE id=$1 AND "ownerId"=$2`,
      [categoryId, ownerId, body.id, body.etag ?? null],
    )
  }

  private async updateCategoryList(ownerId: string, categoryId: string) {
    const rows = await this.source.query(
      `SELECT name,"googleListId" FROM task_categories WHERE id=$1 AND "ownerId"=$2 AND "deletedAt" IS NULL`,
      [categoryId, ownerId],
    )
    const row = rows[0] as { name?: string; googleListId?: string } | undefined
    if (!row?.name) return
    const access = await this.google.authorized(ownerId)
    let listId = row.googleListId ?? null
    if (!listId) {
      await this.pushCategoryList(ownerId, categoryId)
      const again = await this.source.query(
        `SELECT "googleListId" FROM task_categories WHERE id=$1 AND "ownerId"=$2`,
        [categoryId, ownerId],
      )
      listId = again[0]?.googleListId ?? null
    }
    if (!listId) return
    const response = await this.tasks.patchList(access, listId, row.name)
    if (!response.ok) throw new Error('Tasks')
    const body = (await response.json()) as { etag?: string }
    await this.source.query(
      `UPDATE task_categories SET "googleEtag"=$3,"syncState"='synced',"updatedAt"=now() WHERE id=$1 AND "ownerId"=$2`,
      [categoryId, ownerId, body.etag ?? null],
    )
  }

  private async deleteCategoryList(ownerId: string, categoryId: string) {
    const rows = await this.source.query(
      `SELECT "googleListId" FROM task_categories WHERE id=$1 AND "ownerId"=$2`,
      [categoryId, ownerId],
    )
    const listId = rows[0]?.googleListId as string | undefined
    if (!listId) return
    const access = await this.google.authorized(ownerId)
    const response = await this.tasks.deleteList(access, listId)
    if (!response.ok && response.status !== 404) throw new Error('Tasks')
  }

  private async moveTaskList(ownerId: string, taskId: string) {
    const task = await this.task(taskId, ownerId)
    if (!task?.categoryId) {
      await this.pushTask(ownerId, taskId)
      return
    }
    const prefs = await this.preferences(ownerId)
    if (!prefs) return
    const access = await this.google.authorized(ownerId)
    const link = await this.link(ownerId, 'task', taskId)
    if (!link || link.googleKind !== 'task') {
      await this.pushTask(ownerId, taskId)
      return
    }
    const fromList = link.googleCalendarId || '@default'
    const toList = await this.resolveListIdForCategory(
      ownerId,
      task.categoryId,
      task.category,
      prefs,
      access,
    )
    if (fromList === toList) {
      await this.pushTask(ownerId, taskId)
      return
    }
    const response = await this.tasks.move(
      access,
      fromList,
      link.googleResourceId,
      toList,
    )
    if (!response.ok) throw new Error('Tasks')
    const body = (await response.json()) as { etag?: string }
    await this.saveLink(
      ownerId,
      'task',
      task.id,
      'task',
      link.googleResourceId,
      toList,
      body.etag ?? null,
      task.updatedAt,
    )
    await this.pushTask(ownerId, taskId)
  }

  private async pushAgenda(
    ownerId: string,
    agendaId: string,
    attachmentsOnly: boolean,
  ) {
    const item = await this.agenda(agendaId, ownerId)
    if (!item || (attachmentsOnly && item.type !== 'event')) return
    const prefs = await this.preferences(ownerId)
    if (!prefs) return
    const [{ access, driveSubject }, existing] = await Promise.all([
      this.google.authorizedConnection(ownerId),
      this.link(ownerId, 'agenda_item', item.id),
    ])
    if (existing && attachmentsOnly && !driveSubject) return
    const calendarId = existing?.googleCalendarId ?? prefs.defaultCalendarId
    const eventId =
      existing?.googleResourceId ??
      createHash('sha256')
        .update(`colabora:${ownerId}:${item.id}`)
        .digest('hex')
    const attachments =
      driveSubject && item.type === 'event'
        ? await this.drive.copy(access, driveSubject, ownerId, item.attachments)
        : []
    if (existing && attachmentsOnly && !attachments.length) return
    const response = await this.calendar.upsert(
      access,
      calendarId,
      eventId,
      {
        summary: item.title,
        description: item.description ?? '',
        location: item.location ?? '',
        start: { dateTime: new Date(item.startDate).toISOString() },
        end: { dateTime: new Date(item.endDate).toISOString() },
        colorId: item.type === 'project' ? colors.purple : colors.blue,
        ...(item.reminderOffsets && {
          reminders: {
            useDefault: false,
            overrides: item.reminderOffsets.map((minutes) => ({
              method: 'popup',
              minutes,
            })),
          },
        }),
        extendedProperties: {
          private: {
            colaboraEntityId: item.id,
            colaboraEntityType: 'agenda_item',
          },
        },
      },
      attachments,
      Boolean(existing && attachmentsOnly),
    )
    if (!response.ok)
      throw new Error('Não foi possível atualizar o evento no Google Agenda.')
    const body = (await response.json()) as { etag?: string }
    await this.saveLink(
      ownerId,
      'agenda_item',
      item.id,
      'event',
      eventId,
      calendarId,
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
      await this.removeCalendarEvent(
        access,
        payload.googleCalendarId || 'primary',
        payload.googleResourceId,
      )
    }
    if (payload.taskEventId) {
      await this.removeCalendarEvent(
        access,
        payload.taskEventCalendar,
        payload.taskEventId,
      )
    }
    await this.source.query(
      `DELETE FROM google_sync_links WHERE "ownerId"=$1 AND "entityId"=$3
       AND ("entityType"=$2 OR ($2='task' AND "entityType"='task_event'))`,
      [ownerId, payload.entityType, payload.entityId],
    )
  }

  private async removeCalendarEvent(
    access: string,
    calendarId: string,
    eventId: string,
  ) {
    const response = await this.calendar.remove(access, calendarId, eventId)
    if (!response.ok && response.status !== 404 && response.status !== 410)
      throw new Error('Calendar')
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
