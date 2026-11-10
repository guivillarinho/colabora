import { ConfigService } from '@nestjs/config'
import { Repository } from 'typeorm'
import { AgendaItem } from '../agenda/entities/agenda-item.entity'
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
  const agenda = { findOneBy: jest.fn() }
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
      agenda as unknown as Repository<AgendaItem>,
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
  it.each([
    ['event', 'Lembrete de evento'],
    ['project', 'Lembrete de projeto'],
  ] as const)(
    'envia o lembrete do tipo %s na antecedência escolhida',
    async (type, label) => {
      reminders.find.mockResolvedValue([
        {
          ...reminder,
          taskId: null,
          agendaItemId: 'agenda',
          kind: 'before',
        },
      ])
      agenda.findOneBy.mockResolvedValue({
        title: 'Apresentação',
        type,
        ownerId: 'user',
        startDate: new Date(dueDate.getTime() + 60 * 60_000),
        reminderOffsets: [60],
      })
      expect(await service.dispatchDueReminders()).toEqual({ delivered: 1 })
      expect(notify).toHaveBeenCalledWith(['user'], label, 'Apresentação')
    },
  )

  it('ignora um lembrete de tarefa removido na edição', async () => {
    tasks.findOne.mockResolvedValue({ ...task, reminderOffsets: [] })
    expect(await service.dispatchDueReminders()).toEqual({ delivered: 0 })
    expect(notify).not.toHaveBeenCalled()
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
  it('espera entre novas tentativas e desiste depois do limite', async () => {
    reminders.find.mockResolvedValue([
      { ...reminder, attempts: 2, updatedAt: dueDate },
      { ...reminder, id: 'exhausted', attempts: 8, updatedAt: new Date(0) },
    ])
    expect(await service.dispatchDueReminders()).toEqual({ delivered: 0 })
    expect(notify).not.toHaveBeenCalled()
    expect(reminders.update).toHaveBeenCalledTimes(1)
  })
  it('não envia quando outro despachador reivindicou o lembrete', async () => {
    reminders.update.mockResolvedValue({ affected: 0 })
    await service.dispatchDueReminders()
    expect(notify).not.toHaveBeenCalled()
  })
})
