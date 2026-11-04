import { ConfigService } from '@nestjs/config'
import { Repository } from 'typeorm'
import { Task } from '../tasks/entities/task.entity'
import { TaskStatus } from '../tasks/task-status.enum'
import { PushSubscription } from './entities/push-subscription.entity'
import { TaskReminder } from './entities/task-reminder.entity'
import { NotificationsService } from './notifications.service'

describe('NotificationsService reminders', () => {
  const dueDate = new Date('2030-01-01T12:00:00Z')
  const task = {
    id: 'task',
    title: 'Reunião',
    createdById: 'user',
    assignedToId: null,
    dueDate,
    status: TaskStatus.Pending,
  } as Task
  const reminder = {
    id: 'reminder',
    taskId: task.id,
    userId: 'user',
    kind: 'due',
    scheduledAt: dueDate,
    attempts: 0,
  } as TaskReminder
  const reminders = { find: jest.fn(), update: jest.fn() }
  const tasks = { findOne: jest.fn() }
  let service: NotificationsService
  let notify: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(dueDate)
    reminders.find.mockResolvedValue([reminder])
    reminders.update.mockResolvedValue({ affected: 1 })
    tasks.findOne.mockResolvedValue(task)
    service = new NotificationsService(
      {} as Repository<PushSubscription>,
      reminders as unknown as Repository<TaskReminder>,
      tasks as unknown as Repository<Task>,
      new ConfigService(),
    )
    notify = jest.spyOn(service, 'notifyUsers').mockResolvedValue(true)
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('envia no horário e marca como enviado', async () => {
    expect(await service.dispatchDueReminders()).toEqual({ delivered: 1 })
    expect(notify).toHaveBeenCalledWith(
      ['user'],
      'Tarefa no horário marcado',
      'Reunião',
    )
    expect(reminders.update).toHaveBeenLastCalledWith(
      { id: reminder.id },
      { status: 'sent', sentAt: dueDate },
    )
  })
  it('tenta novamente após falha de envio', async () => {
    notify.mockResolvedValue(false)
    expect(await service.dispatchDueReminders()).toEqual({ delivered: 0 })
    expect(reminders.update).toHaveBeenLastCalledWith(
      { id: reminder.id },
      { status: 'pending', attempts: 1 },
    )
  })
  it.each([
    { ...task, status: TaskStatus.Completed },
    { ...task, dueDate: new Date(dueDate.getTime() + 60_000) },
    null,
  ])(
    'ignora tarefas concluídas, reagendadas ou excluídas',
    async (currentTask) => {
      tasks.findOne.mockResolvedValue(currentTask)
      await service.dispatchDueReminders()
      expect(notify).not.toHaveBeenCalled()
    },
  )
  it('não envia quando outro despachador reivindicou o lembrete', async () => {
    reminders.update.mockResolvedValue({ affected: 0 })
    await service.dispatchDueReminders()
    expect(notify).not.toHaveBeenCalled()
  })
})
