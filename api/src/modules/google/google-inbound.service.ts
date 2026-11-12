import { Inject, Injectable, forwardRef } from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import { DataSource } from 'typeorm'

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

  async pullCalendar(ownerId: string, calendarId: string) {
    const prefs = await this.preferences(ownerId)
    if (!prefs?.inboundEnabled) return
    const access = await this.google.authorized(ownerId)
    const channels = await this.source.query(
      'SELECT "syncToken" FROM google_watch_channels WHERE "ownerId"=$1 AND "calendarId"=$2',
      [ownerId, calendarId],
    )
    let response = await this.calendar.listEvents(
      access,
      calendarId,
      channels[0]?.syncToken,
    )
    if (response.status === 410) {
      response = await this.calendar.listEvents(access, calendarId, null)
    }
    if (!response.ok) throw new Error('Calendar')
    const body = (await response.json()) as {
      items?: Array<Record<string, unknown>>
      nextSyncToken?: string
    }
    for (const item of body.items ?? [])
      await this.applyEvent(ownerId, calendarId, item)
    if (body.nextSyncToken) {
      await this.source.query(
        'UPDATE google_watch_channels SET "syncToken"=$3 WHERE "ownerId"=$1 AND "calendarId"=$2',
        [ownerId, calendarId, body.nextSyncToken],
      )
    }
  }

  async pullTaskLists(ownerId: string) {
    const prefs = await this.preferences(ownerId)
    if (!prefs?.inboundEnabled) return
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

  async pullTasks(ownerId: string) {
    const prefs = await this.preferences(ownerId)
    if (!prefs?.inboundEnabled) return
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
    for (const id of Object.values(prefs.categoryTaskListMap)) {
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
    const updatedMin = cursor[0]?.tasksPolledAt
      ? new Date(cursor[0].tasksPolledAt).toISOString()
      : null
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
    const mark = privateMark(item)
    const entityId = link?.entityId ?? mark?.id
    if (!entityId) return
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
    if (!rows[0]) return
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

  private async applyTask(
    ownerId: string,
    listId: string,
    item: Record<string, unknown>,
  ) {
    const id = String(item.id ?? '')
    const link = await this.linkByResource(ownerId, 'task', id)
    const marked = colaboraId(String(item.notes ?? ''))
    const entityId = link?.entityId ?? marked
    if (!entityId) return
    if (item.deleted === true) {
      if (!link) return
      await this.source.query(
        'DELETE FROM tasks WHERE id=$1 AND "createdById"=$2',
        [entityId, ownerId],
      )
      await this.deleteLink(ownerId, 'task', entityId)
      return
    }
    const rows = await this.source.query(
      'SELECT id,"updatedAt" FROM tasks WHERE id=$1 AND "createdById"=$2',
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
    await this.source.query(
      `UPDATE tasks SET title=$3, description=$4, "dueDate"=$5, status=$6, "completedAt"=$7, "updatedAt"=$8,
       "categoryId"=COALESCE($9,"categoryId"), category=COALESCE($10,category), color=COALESCE($11,color)
       WHERE id=$1 AND "createdById"=$2`,
      [
        entityId,
        ownerId,
        String(item.title ?? 'Tarefa').slice(0, 120),
        stripMark(String(item.notes ?? '')),
        item.due ? new Date(String(item.due)) : null,
        completed ? TaskStatus.Completed : TaskStatus.Pending,
        completed ? revision : null,
        revision,
        category?.id ?? null,
        category?.name ?? null,
        category?.color ?? null,
      ],
    )
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
