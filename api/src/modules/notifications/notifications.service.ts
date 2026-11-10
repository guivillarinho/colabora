import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import type { PushSubscription as WebPushSubscription } from 'web-push'
import webPush from 'web-push'
import {
  LessThan,
  LessThanOrEqual,
  Repository,
  type EntityManager,
} from 'typeorm'

import { AgendaItem } from '../agenda/entities/agenda-item.entity'
import { Task } from '../tasks/entities/task.entity'
import { TaskStatus } from '../tasks/task-status.enum'
import { PushSubscription } from './entities/push-subscription.entity'
import {
  TaskReminder,
  type ReminderKind,
} from './entities/task-reminder.entity'
import type { PushSubscriptionDto } from './notifications.dto'

import { reminderTime } from './reminder-options'
const MAX_REMINDER_ATTEMPTS = 8

export function taskReminderOffsets(task: Task): number[] {
  return task.reminderOffsets ?? [10, 0]
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptions: Repository<PushSubscription>,
    @InjectRepository(TaskReminder)
    private readonly reminders: Repository<TaskReminder>,
    @InjectRepository(Task)
    private readonly tasks: Repository<Task>,
    private readonly config: ConfigService,
    @InjectRepository(AgendaItem)
    private readonly agenda: Repository<AgendaItem>,
  ) {}

  publicKey(): string {
    const key = this.config.get<string>('VAPID_PUBLIC_KEY')
    if (!key || !this.config.get<string>('VAPID_PRIVATE_KEY'))
      throw new ServiceUnavailableException('Push indisponível.')
    return key
  }

  async saveSubscription(userId: string, subscription: PushSubscriptionDto) {
    this.assertConfigured()
    const existing = await this.subscriptions.findOneBy({
      endpoint: subscription.endpoint,
    })
    if (existing && existing.userId !== userId) {
      throw new ForbiddenException('Esta inscrição já pertence a outra conta.')
    }
    return this.subscriptions.upsert(
      {
        ...subscription,
        userId,
      },
      ['endpoint'],
    )
  }

  async removeSubscription(userId: string, endpoint: string): Promise<void> {
    await this.subscriptions.delete({ userId, endpoint })
  }

  async notifyUsers(
    userIds: Array<string | null | undefined>,
    title: string,
    body: string,
  ): Promise<boolean> {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))]
    if (!ids.length) return true
    if (!this.configured()) return false

    try {
      const subscriptions = await this.subscriptions.findBy(
        ids.map((userId) => ({ userId })),
      )
      const payload = JSON.stringify({ title, body, url: '/agenda' })
      const results = await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            await webPush.sendNotification(
              this.asWebPushSubscription(subscription),
              payload,
              { TTL: 60 * 60, timeout: 5000 },
            )
            return true
          } catch (error) {
            const statusCode = (error as { statusCode?: number }).statusCode
            if (statusCode === 404 || statusCode === 410) {
              await this.subscriptions.delete({ id: subscription.id })
              return true
            }
            return false
          }
        }),
      )
      return results.every(Boolean)
    } catch {
      return false
    }
  }

  async scheduleTaskReminders(
    task: Task,
    manager: EntityManager,
  ): Promise<void> {
    const userId = this.taskRecipient(task)
    if (!task.dueDate || !userId) return
    await this.enqueue(
      { taskId: task.id },
      userId,
      task.dueDate,
      taskReminderOffsets(task),
      manager,
    )
  }

  async scheduleAgendaReminders(
    item: AgendaItem,
    manager: EntityManager,
  ): Promise<void> {
    if (!item.ownerId || !item.reminderOffsets?.length) return
    await this.enqueue(
      { agendaItemId: item.id },
      item.ownerId,
      item.startDate,
      item.reminderOffsets,
      manager,
    )
  }

  private async enqueue(
    source: { taskId: string } | { agendaItemId: string },
    userId: string,
    start: Date,
    offsets: number[],
    manager: EntityManager,
  ): Promise<void> {
    const now = Date.now()
    const rows = offsets
      .map((minutes) => ({
        ...source,
        userId,
        kind: (minutes === 0 ? 'due' : 'before') as ReminderKind,
        scheduledAt: new Date(reminderTime(start, minutes)),
      }))
      .filter((row) => row.scheduledAt.getTime() > now)
    if (!rows.length) return
    await manager
      .getRepository(TaskReminder)
      .createQueryBuilder()
      .insert()
      .values(rows)
      .orIgnore()
      .execute()
  }

  private taskRecipient(task: Task): string | null {
    if (
      task.status === TaskStatus.Completed ||
      task.assignmentStatus === 'pending' ||
      task.assignmentStatus === 'declined'
    )
      return null
    return task.assignedToId ?? task.createdById
  }

  async dispatchDueReminders(): Promise<{ delivered: number }> {
    const now = new Date()
    const stale = new Date(now.getTime() - 5 * 60 * 1000)
    await this.reminders.update(
      { status: 'processing', updatedAt: LessThanOrEqual(stale) },
      { status: 'pending' },
    )
    const due = await this.reminders.find({
      where: {
        status: 'pending',
        scheduledAt: LessThanOrEqual(now),
        attempts: LessThan(MAX_REMINDER_ATTEMPTS),
      },
      order: { scheduledAt: 'ASC' },
      take: 100,
    })
    let delivered = 0
    for (const reminder of due) {
      if (reminder.attempts >= MAX_REMINDER_ATTEMPTS) continue
      if (reminder.attempts > 0 && reminder.updatedAt) {
        const wait = Math.min(
          60 * 60 * 1000,
          15_000 * 2 ** (reminder.attempts - 1),
        )
        if (now.getTime() - new Date(reminder.updatedAt).getTime() < wait)
          continue
      }
      const claim = await this.reminders.update(
        { id: reminder.id, status: 'pending' },
        { status: 'processing' },
      )
      if (claim.affected !== 1) continue
      try {
        const current = await this.currentReminder(reminder)
        if (current) {
          const wasDelivered = await this.notifyUsers(
            [reminder.userId],
            current.label,
            current.title,
          )
          if (!wasDelivered) throw new Error('Push não enviado.')
          delivered += 1
        }
        await this.reminders.update(
          { id: reminder.id },
          { status: 'sent', sentAt: new Date() },
        )
      } catch {
        await this.reminders.update(
          { id: reminder.id },
          { status: 'pending', attempts: reminder.attempts + 1 },
        )
      }
    }
    return { delivered }
  }

  private async currentReminder(reminder: TaskReminder) {
    if (reminder.agendaItemId) {
      const item = await this.agenda.findOneBy({ id: reminder.agendaItemId })
      if (
        item?.ownerId === reminder.userId &&
        this.matchesReminder(
          reminder,
          item.startDate,
          item.reminderOffsets ?? [],
        )
      ) {
        const kind = item.type === 'project' ? 'Projeto' : 'Evento'
        return { title: item.title, label: `Lembrete de ${kind.toLowerCase()}` }
      }
      return null
    }

    if (!reminder.taskId) return null
    const task = await this.tasks.findOne({ where: { id: reminder.taskId } })
    if (
      !task?.dueDate ||
      this.taskRecipient(task) !== reminder.userId ||
      !this.matchesReminder(reminder, task.dueDate, taskReminderOffsets(task))
    )
      return null
    return {
      title: task.title,
      label:
        reminder.kind === 'due'
          ? 'Tarefa no horário marcado'
          : 'Lembrete de tarefa',
    }
  }

  private matchesReminder(
    reminder: TaskReminder,
    start: Date,
    offsets: number[],
  ): boolean {
    const scheduledAt = reminder.scheduledAt.getTime()
    return offsets.some(
      (minutes) => reminderTime(start, minutes) === scheduledAt,
    )
  }

  private asWebPushSubscription(
    subscription: PushSubscription,
  ): WebPushSubscription {
    return {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    }
  }

  private configured(): boolean {
    try {
      this.assertConfigured()
      return true
    } catch {
      return false
    }
  }

  private assertConfigured(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')
    if (!publicKey || !privateKey)
      throw new ServiceUnavailableException('Push indisponível.')
    webPush.setVapidDetails(
      this.config.get<string>('VAPID_SUBJECT', 'mailto:admin@colabora.app'),
      publicKey,
      privateKey,
    )
  }
}
