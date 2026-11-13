import { Inject, Injectable, forwardRef } from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import { DataSource } from 'typeorm'

import { NotificationsService } from '../notifications/notifications.service'
import { Task } from '../tasks/entities/task.entity'
import { TaskStatus } from '../tasks/task-status.enum'
import { GoogleCalendarClient } from './google-calendar.client'
import { GoogleService } from './google.service'
import { GoogleTasksClient } from './google-tasks.client'
import { googlePreferences } from './google-preferences'

type LinkRow = {
  entityType: string
  entityId: string
  googleKind: string
  googleResourceId: string
  googleCalendarId: string | null
  googleEtag: string | null
  colaboraRevision: Date | null
  syncedAt: Date
  syncState: string
}

const conflictWindowMs = 5000

@Injectable()
export class GoogleInboundService {
  constructor(
    private readonly source: DataSource,
    @Inject(forwardRef(() => GoogleService))
    private readonly google: GoogleService,
    private readonly tasks: GoogleTasksClient,
    private readonly calendar: GoogleCalendarClient,
    private readonly notifications: NotificationsService,
  ) {}

  async acceptWebhook(headers: Record<string, string | string[] | undefined>) {
    const channelId = header(headers, 'x-goog-channel-id')
    const token = header(headers, 'x-goog-channel-token')
    const state = header(headers, 'x-goog-resource-state')
    if (!channelId || !token) return false
    const rows = await this.source.query(
      'SELECT "ownerId","calendarId",token FROM google_watch_channels WHERE "channelId"=$1',
      [channelId],
    )
    const channel = rows[0] as
      { ownerId: string; calendarId: string; token: string } | undefined
    if (!channel || !same(channel.token, token)) return false
    if (state !== 'sync') {
      await this.source.query(
        `INSERT INTO google_sync_outbox (id,"ownerId",operation,payload) VALUES (gen_random_uuid(),$1,'pull-calendar',$2::jsonb)`,
        [channel.ownerId, JSON.stringify({ calendarId: channel.calendarId })],
      )
    }
    return true
  }

  async pullCalendar(
    ownerId: string,
    calendarId: string,
    options?: { force?: boolean; window?: boolean },
  ) {
    const prefs = await this.preferences(ownerId)
    if (!options?.force && !prefs?.inboundEnabled) return
    const access = await this.google.authorized(ownerId)
    const channels = await this.source.query(
      'SELECT "syncToken" FROM google_watch_channels WHERE "ownerId"=$1 AND "calendarId"=$2',
      [ownerId, calendarId],
    )
    const window = options?.window
      ? {
          timeMin: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
          timeMax: new Date(
            Date.now() + 45 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }
      : undefined
    let response = await this.calendar.listEvents(
      access,
      calendarId,
      window ? null : channels[0]?.syncToken,
      window,
    )
    if (response.status === 410) {
      response = await this.calendar.listEvents(
        access,
        calendarId,
        null,
        window,
      )
    }
    if (!response.ok) throw new Error('Calendar')
    let body = (await response.json()) as {
      items?: Array<Record<string, unknown>>
      nextSyncToken?: string
      nextPageToken?: string
    }
    const items = [...(body.items ?? [])]
    while (body.nextPageToken) {
      response = await this.calendar.listEvents(
        access,
        calendarId,
        null,
        window,
        body.nextPageToken,
      )
      if (!response.ok) throw new Error('Calendar')
      body = (await response.json()) as typeof body
      items.push(...(body.items ?? []))
    }
    for (const item of items) await this.applyEvent(ownerId, calendarId, item)
    if (body.nextSyncToken && !options?.window) {
      await this.source.query(
        'UPDATE google_watch_channels SET "syncToken"=$3 WHERE "ownerId"=$1 AND "calendarId"=$2',
        [ownerId, calendarId, body.nextSyncToken],
      )
    }
  }

  async pullTaskLists(ownerId: string, options?: { force?: boolean }) {
    const prefs = await this.preferences(ownerId)
    if (!options?.force && !prefs?.inboundEnabled) return
    const access = await this.google.authorized(ownerId)
    const response = await this.tasks.listLists(access)
    if (!response.ok) throw new Error('Tasks')
    const body = (await response.json()) as {
      items?: Array<{ id?: string; title?: string; etag?: string }>
    }
    const remote = body.items ?? []
    const local = (await this.source.query(
      `SELECT id,name,"googleListId","googleEtag","syncState","updatedAt" FROM task_categories
       WHERE "ownerId"=$1 AND "deletedAt" IS NULL`,
      [ownerId],
    )) as Array<{
      id: string
      name: string
      googleListId: string | null
      googleEtag: string | null
      syncState: string
      updatedAt: Date
    }>
    const byListId = new Map(
      local
        .filter((row) => row.googleListId)
        .map((row) => [row.googleListId as string, row]),
    )
    const byName = new Map(
      local.map((row) => [row.name.trim().toLowerCase(), row]),
    )
    for (const list of remote) {
      if (!list.id) continue
      const title = (list.title || '').trim().slice(0, 40)
      if (!title) continue
      const existing = byListId.get(list.id) ?? byName.get(title.toLowerCase())
      if (!existing) {
        await this.source.query(
          `INSERT INTO task_categories (id,"ownerId",name,color,"googleListId","googleEtag","syncState")
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,'synced')`,
          [ownerId, title, colorFromName(title), list.id, list.etag ?? null],
        )
        continue
      }
      if (
        existing.googleListId === list.id &&
        existing.name !== title &&
        existing.syncState !== 'conflict'
      ) {
        await this.source.query(
          `UPDATE task_categories SET name=$3,"googleEtag"=$4,"syncState"='synced',"updatedAt"=now()
           WHERE id=$1 AND "ownerId"=$2`,
          [existing.id, ownerId, title, list.etag ?? null],
        )
        await this.source.query(
          `UPDATE tasks SET category=$3 WHERE "createdById"=$1 AND "categoryId"=$2`,
          [ownerId, existing.id, title],
        )
      } else if (!existing.googleListId) {
        await this.source.query(
          `UPDATE task_categories SET "googleListId"=$3,"googleEtag"=$4,"syncState"='synced',"updatedAt"=now()
           WHERE id=$1 AND "ownerId"=$2`,
          [existing.id, ownerId, list.id, list.etag ?? null],
        )
      }
    }
    for (const row of local) {
      if (!row.googleListId) continue
      if (!remote.some((item) => item.id === row.googleListId)) {
        await this.source.query(
          `UPDATE task_categories SET "deletedAt"=now(),"syncState"='synced' WHERE id=$1 AND "ownerId"=$2`,
          [row.id, ownerId],
        )
      }
    }
  }

  async pullTasks(
    ownerId: string,
    options?: { force?: boolean; full?: boolean },
  ) {
    const prefs = await this.preferences(ownerId)
    if (!options?.force && !prefs?.inboundEnabled) return
    const access = await this.google.authorized(ownerId)
    const listResponse = await this.tasks.listLists(access)
    const listBody = listResponse.ok
      ? ((await listResponse.json()) as {
          items?: Array<{ id?: string }>
        })
      : { items: [] }
    const lists = new Set<string>(['@default'])
    for (const item of listBody.items ?? []) {
      if (item.id) lists.add(item.id)
    }
    for (const id of Object.values(prefs?.categoryTaskListMap ?? {})) {
      if (id) lists.add(id)
    }
    const categoryRows = await this.source.query(
      `SELECT "googleListId" FROM task_categories WHERE "ownerId"=$1 AND "deletedAt" IS NULL AND "googleListId" IS NOT NULL`,
      [ownerId],
    )
    for (const row of categoryRows) {
      if (row.googleListId) lists.add(row.googleListId)
    }
    const cursor = await this.source.query(
      'SELECT "tasksPolledAt" FROM google_connections WHERE "ownerId"=$1',
      [ownerId],
    )
    const updatedMin =
      options?.full || !cursor[0]?.tasksPolledAt
        ? null
        : new Date(cursor[0].tasksPolledAt).toISOString()
    for (const listId of lists) {
      const response = await this.tasks.listUpdated(access, listId, updatedMin)
      if (!response.ok) throw new Error('Tasks')
      const body = (await response.json()) as {
        items?: Array<Record<string, unknown>>
      }
      for (const item of body.items ?? [])
        await this.applyTask(ownerId, listId, item)
    }
    await this.source.query(
      'UPDATE google_connections SET "tasksPolledAt"=now() WHERE "ownerId"=$1',
      [ownerId],
    )
  }

  private async applyEvent(
    ownerId: string,
    calendarId: string,
    item: Record<string, unknown>,
  ) {
    const id = String(item.id ?? '')
    const link = await this.linkByResource(ownerId, 'event', id)
    if (
      link?.entityType === 'task_event' ||
      link?.entityType === 'task' ||
      (
        item.extendedProperties as
          { private?: Record<string, string> } | undefined
      )?.private?.colaboraEntityType === 'task'
    ) {
      if (link) await this.applyTaskEvent(ownerId, calendarId, item, link)
      return
    }
    const mark = privateMark(item)
    const entityId = link?.entityId ?? mark?.id
    if (!entityId) {
      await this.importEvent(ownerId, calendarId, id, item)
      return
    }
    if (item.status === 'cancelled') {
      if (!link) return
      await this.source.query(
        'DELETE FROM agenda_items WHERE id=$1 AND "ownerId"=$2',
        [entityId, ownerId],
      )
      await this.deleteLink(ownerId, 'agenda_item', entityId)
      return
    }
    const rows = await this.source.query(
      'SELECT id,"updatedAt" FROM agenda_items WHERE id=$1 AND "ownerId"=$2',
      [entityId, ownerId],
    )
    if (!rows[0]) {
      await this.importEvent(ownerId, calendarId, id, item)
      return
    }
    if (this.conflict(rows[0].updatedAt, link, item.updated)) {
      await this.markConflict(ownerId, 'agenda_item', entityId)
      return
    }
    const start = dateTime(item.start)
    const end = dateTime(item.end)
    if (!start || !end) return
    const revision = new Date()
    await this.source.query(
      `UPDATE agenda_items SET title=$3, description=$4, location=$5, "startDate"=$6, "endDate"=$7, "updatedAt"=$8
       WHERE id=$1 AND "ownerId"=$2`,
      [
        entityId,
        ownerId,
        String(item.summary ?? 'Evento').slice(0, 120),
        textOrNull(item.description),
        textOrNull(item.location),
        start,
        end,
        revision,
      ],
    )
    await this.saveLink({
      ownerId,
      entityType: 'agenda_item',
      entityId,
      googleKind: 'event',
      googleResourceId: id,
      googleCalendarId: calendarId,
      googleEtag: stringOrNull(item.etag),
      revision,
      state: 'synced',
    })
  }

  private async applyTaskEvent(
    ownerId: string,
    calendarId: string,
    item: Record<string, unknown>,
    link: LinkRow,
  ) {
    if (item.status === 'cancelled') {
      await this.deleteLink(ownerId, link.entityType, link.entityId)
      return
    }
    if (link.googleEtag && link.googleEtag === item.etag) return
    const start = dateTime(item.start)
    const end = dateTime(item.end)
    if (
      !start ||
      !end ||
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime())
    )
      return
    const [task] = await this.source.query(
      'SELECT id,"updatedAt" FROM tasks WHERE id=$1 AND "createdById"=$2',
      [link.entityId, ownerId],
    )
    if (!task) return
    if (this.conflict(task.updatedAt, link, item.updated)) {
      await this.markConflict(ownerId, link.entityType, link.entityId)
      return
    }
    const duration = Math.max(
      1,
      Math.min(10080, Math.round((end.getTime() - start.getTime()) / 60000)),
    )
    const revision = new Date()
    await this.source.transaction(async (manager) => {
      const [updated] = await manager.query(
        `UPDATE tasks SET title=$3, description=$4, location=$5, "dueDate"=$6,
         "estimatedTime"=$7, "updatedAt"=$8 WHERE id=$1 AND "createdById"=$2
         RETURNING *`,
        [
          link.entityId,
          ownerId,
          String(item.summary || 'Tarefa').slice(0, 120),
          textOrNull(item.description),
          textOrNull(item.location)?.slice(0, 200) ?? null,
          start,
          duration,
          revision,
        ],
      )
      if (updated)
        await this.notifications.scheduleTaskReminders(updated as Task, manager)
    })
    await this.saveLink({
      ...link,
      ownerId,
      googleCalendarId: calendarId,
      googleEtag: stringOrNull(item.etag),
      revision,
      state: 'synced',
    })
    await this.queueTaskPush(ownerId, link.entityId, 'tasks')
  }

  private async queueTaskPush(
    ownerId: string,
    taskId: string,
    target: 'tasks' | 'calendar',
  ) {
    const prefs = await this.preferences(ownerId)
    if (!prefs?.autoSync) return
    await this.source.query(
      `INSERT INTO google_sync_outbox (id,"ownerId",operation,payload)
       VALUES (gen_random_uuid(),$1,'push-task',$2::jsonb)`,
      [ownerId, JSON.stringify({ taskId, target })],
    )
  }

  private async applyTask(
    ownerId: string,
    listId: string,
    item: Record<string, unknown>,
  ) {
    const id = String(item.id ?? '')
    const link = await this.linkByResource(ownerId, 'task', id)
    const marked = colaboraId(String(item.notes ?? ''))
    const entityId = link?.entityId ?? marked
    if (!entityId) {
      await this.importTask(ownerId, listId, id, item)
      return
    }
    if (item.deleted === true) {
      if (!link) return
      await this.source.query(
        'DELETE FROM tasks WHERE id=$1 AND "createdById"=$2',
        [entityId, ownerId],
      )
      await this.deleteLink(ownerId, 'task', entityId)
      await this.source.query(
        `INSERT INTO google_sync_outbox (id,"ownerId",operation,payload)
         SELECT gen_random_uuid(),$1,'delete-task',
         jsonb_build_object('entityType','task','entityId',"entityId",
           'taskEventId',"googleResourceId",'taskEventCalendar',"googleCalendarId")
         FROM google_sync_links WHERE "ownerId"=$1 AND "entityType"='task_event' AND "entityId"=$2`,
        [ownerId, entityId],
      )
      return
    }
    if (link?.googleEtag && link.googleEtag === item.etag) return
    const rows = await this.source.query(
      'SELECT id,"updatedAt","dueDate","completedAt" FROM tasks WHERE id=$1 AND "createdById"=$2',
      [entityId, ownerId],
    )
    if (!rows[0]) return
    if (this.conflict(rows[0].updatedAt, link, item.updated)) {
      await this.markConflict(ownerId, 'task', entityId)
      return
    }
    const revision = new Date()
    const completed = item.status === 'completed'
    const categoryRows = await this.source.query(
      `SELECT id,name,color FROM task_categories WHERE "ownerId"=$1 AND "googleListId"=$2 AND "deletedAt" IS NULL`,
      [ownerId, listId],
    )
    const category = categoryRows[0] as
      { id: string; name: string; color: string } | undefined
    const due = dueOnLocalDay(item.due)
    const previousDue = rows[0].dueDate ? new Date(rows[0].dueDate) : null
    if (due && previousDue) {
      // Tasks returns a date only. Carry the existing hour across edits.
      due.setUTCHours(
        previousDue.getUTCHours(),
        previousDue.getUTCMinutes(),
        previousDue.getUTCSeconds(),
        previousDue.getUTCMilliseconds(),
      )
    }
    const completedAt = completed
      ? (dateTime({
          dateTime:
            typeof item.completed === 'string' ? item.completed : undefined,
        }) ??
        rows[0].completedAt ??
        null)
      : null
    await this.source.transaction(async (manager) => {
      const [updated] = await manager.query(
        `UPDATE tasks SET title=$3, description=$4, "dueDate"=$5, status=$6, "completedAt"=$7, "updatedAt"=$8,
       "categoryId"=COALESCE($9,"categoryId"), category=COALESCE($10,category), color=COALESCE($11,color)
       WHERE id=$1 AND "createdById"=$2 RETURNING *`,
        [
          entityId,
          ownerId,
          String(item.title ?? 'Tarefa').slice(0, 120),
          stripMark(String(item.notes ?? '')),
          due,
          completed ? TaskStatus.Completed : TaskStatus.Pending,
          completedAt,
          revision,
          category?.id ?? null,
          category?.name ?? null,
          category?.color ?? null,
        ],
      )
      if (updated)
        await this.notifications.scheduleTaskReminders(updated as Task, manager)
    })
    await this.saveLink({
      ownerId,
      entityType: 'task',
      entityId,
      googleKind: 'task',
      googleResourceId: id,
      googleCalendarId: listId,
      googleEtag: stringOrNull(item.etag),
      revision,
      state: 'synced',
    })
    // Refresh an existing Calendar counterpart without assigning an invented
    // time to a date-only task imported from Google.
    const events = await this.source.query(
      `SELECT 1 FROM google_sync_links WHERE "ownerId"=$1 AND "entityType"='task_event' AND "entityId"=$2`,
      [ownerId, entityId],
    )
    if (events.length) await this.queueTaskPush(ownerId, entityId, 'calendar')
  }

  private async importEvent(
    ownerId: string,
    calendarId: string,
    id: string,
    item: Record<string, unknown>,
  ) {
    if (!id || item.status === 'cancelled') return
    const existing = await this.linkByResource(ownerId, 'event', id)
    const start = dateTime(item.start)
    const end =
      dateTime(item.end) ??
      (start ? new Date(start.getTime() + 60 * 60 * 1000) : null)
    if (!start || !end) return
    const title = String(item.summary ?? 'Evento').slice(0, 120)
    const description = textOrNull(item.description)
    const location = textOrNull(item.location)
    const revision = new Date()
    let entityId = existing?.entityId as string | undefined
    if (entityId) {
      const local = await this.source.query(
        'SELECT id FROM agenda_items WHERE id=$1 AND "ownerId"=$2',
        [entityId, ownerId],
      )
      if (!local[0]) entityId = undefined
    }
    if (entityId) {
      await this.source.query(
        `UPDATE agenda_items SET title=$3, description=$4, location=$5, "startDate"=$6, "endDate"=$7, "updatedAt"=$8
         WHERE id=$1 AND "ownerId"=$2`,
        [entityId, ownerId, title, description, location, start, end, revision],
      )
    } else {
      const rows = await this.source.query(
        `INSERT INTO agenda_items (id,"ownerId",title,type,description,"startDate","endDate",location,attachments)
         VALUES (gen_random_uuid(),$1,$2,'event',$3,$4,$5,$6,'[]'::jsonb)
         RETURNING id`,
        [ownerId, title, description, start, end, location],
      )
      entityId = rows[0]?.id as string | undefined
      if (!entityId) return
    }
    await this.saveLink({
      ownerId,
      entityType: 'agenda_item',
      entityId,
      googleKind: 'event',
      googleResourceId: id.slice(0, 1024),
      googleCalendarId: calendarId,
      googleEtag: stringOrNull(item.etag),
      revision,
      state: 'synced',
    })
  }

  private async importTask(
    ownerId: string,
    listId: string,
    id: string,
    item: Record<string, unknown>,
  ) {
    if (!id || item.deleted === true) return
    const title = String(item.title ?? '')
      .trim()
      .slice(0, 120)
    if (!title) return
    const categoryRows = await this.source.query(
      `SELECT id,name,color FROM task_categories WHERE "ownerId"=$1 AND "googleListId"=$2 AND "deletedAt" IS NULL`,
      [ownerId, listId],
    )
    const category = categoryRows[0] as
      { id: string; name: string; color: string } | undefined
    const completed = item.status === 'completed'
    const revision = new Date()
    const rows = await this.source.query(
      `INSERT INTO tasks (
         id,title,description,category,"categoryId",color,"dueDate",status,"completedAt",
         "estimatedTime","createdById","assignedToId","assignmentStatus",attachments
       ) VALUES (
         gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,30,$9,$9,'accepted','[]'::jsonb
       ) RETURNING id`,
      [
        title,
        stripMark(String(item.notes ?? '')),
        category?.name ?? 'Google',
        category?.id ?? null,
        category?.color ?? 'blue',
        dueOnLocalDay(item.due),
        completed ? TaskStatus.Completed : TaskStatus.Pending,
        completed ? revision : null,
        ownerId,
      ],
    )
    const createdId = rows[0]?.id as string | undefined
    if (!createdId) return
    await this.saveLink({
      ownerId,
      entityType: 'task',
      entityId: createdId,
      googleKind: 'task',
      googleResourceId: id.slice(0, 1024),
      googleCalendarId: listId,
      googleEtag: stringOrNull(item.etag),
      revision,
      state: 'synced',
    })
  }

  private conflict(
    localUpdated: Date | string | null,
    link: LinkRow | undefined,
    remoteUpdated: unknown,
  ) {
    if (
      !link?.colaboraRevision ||
      !link.syncedAt ||
      !localUpdated ||
      !remoteUpdated
    )
      return false
    const local = new Date(localUpdated).getTime()
    const remote = new Date(String(remoteUpdated)).getTime()
    return (
      local > new Date(link.colaboraRevision).getTime() + conflictWindowMs &&
      remote > new Date(link.syncedAt).getTime() + conflictWindowMs
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

  private async linkByResource(
    ownerId: string,
    kind: string,
    resourceId: string,
  ): Promise<LinkRow | undefined> {
    const rows = await this.source.query(
      `SELECT "entityType","entityId","googleKind","googleResourceId","googleCalendarId","googleEtag","colaboraRevision","syncedAt","syncState"
       FROM google_sync_links WHERE "ownerId"=$1 AND "googleKind"=$2 AND "googleResourceId"=$3`,
      [ownerId, kind, resourceId],
    )
    return rows[0]
  }

  private async markConflict(
    ownerId: string,
    entityType: string,
    entityId: string,
  ) {
    await this.source.query(
      `UPDATE google_sync_links SET "syncState"='conflict' WHERE "ownerId"=$1 AND "entityType"=$2 AND "entityId"=$3`,
      [ownerId, entityType, entityId],
    )
  }

  private async deleteLink(
    ownerId: string,
    entityType: string,
    entityId: string,
  ) {
    await this.source.query(
      'DELETE FROM google_sync_links WHERE "ownerId"=$1 AND "entityType"=$2 AND "entityId"=$3',
      [ownerId, entityType, entityId],
    )
  }

  private async saveLink(link: {
    ownerId: string
    entityType: string
    entityId: string
    googleKind: string
    googleResourceId: string
    googleCalendarId: string | null
    googleEtag: string | null
    revision: Date
    state: string
  }) {
    await this.source.query(
      `INSERT INTO google_sync_links
        ("ownerId","entityType","entityId","googleKind","googleResourceId","googleCalendarId","googleEtag","colaboraRevision","syncState")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT ("ownerId","entityType","entityId") DO UPDATE SET
        "googleKind"=EXCLUDED."googleKind",
        "googleResourceId"=EXCLUDED."googleResourceId",
        "googleCalendarId"=EXCLUDED."googleCalendarId",
        "googleEtag"=EXCLUDED."googleEtag",
        "colaboraRevision"=EXCLUDED."colaboraRevision",
        "syncState"=EXCLUDED."syncState",
        "syncedAt"=now()`,
      [
        link.ownerId,
        link.entityType,
        link.entityId,
        link.googleKind,
        link.googleResourceId,
        link.googleCalendarId,
        link.googleEtag,
        link.revision,
        link.state,
      ],
    )
  }
}

function header(
  headers: Record<string, string | string[] | undefined>,
  name: string,
) {
  const value = headers[name]
  return Array.isArray(value) ? value[0] : value
}

function same(expected: string, received: string) {
  if (Buffer.byteLength(expected) !== Buffer.byteLength(received)) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}

function privateMark(item: Record<string, unknown>) {
  const properties = item.extendedProperties as
    { private?: Record<string, string> } | undefined
  const id = properties?.private?.colaboraEntityId
  const type = properties?.private?.colaboraEntityType
  if (!id || type !== 'agenda_item') return null
  return { id }
}

function colaboraId(notes: string) {
  return notes.match(/\[colabora:([0-9a-f-]{36})\]/i)?.[1] ?? null
}

function stripMark(notes: string) {
  const value = notes.replace(/\n?\[colabora:[0-9a-f-]{36}\]/i, '').trim()
  return value || null
}

function dueOnLocalDay(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  if (/T00:00:00(?:\.000)?Z$/u.test(value)) date.setUTCHours(15)
  return date
}

function dateTime(value: unknown) {
  const record = value as { dateTime?: string; date?: string } | undefined
  if (record?.dateTime) return new Date(record.dateTime)
  if (record?.date) return new Date(`${record.date}T00:00:00.000Z`)
  return null
}

function textOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' ? value : null
}

const palette = ['blue', 'yellow', 'purple', 'green', 'orange', 'red'] as const

function colorFromName(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i)) % palette.length
  }
  return palette[hash]
}
