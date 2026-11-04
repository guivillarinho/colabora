import { UsersService } from '../auth/users.service'
import { AttachmentsService } from '../agenda/attachments.service'
import { NotificationsService } from '../notifications/notifications.service'
import { NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'

import { Task } from './entities/task.entity'
import {
  PRODUCTIVITY_ADVICE,
  ProductivityAdvisorService,
} from './productivity-advisor.service'
import { TaskColor } from './task-color.enum'
import { TaskPriority } from './task-priority.enum'
import { TaskStatus } from './task-status.enum'
import { TasksService } from './tasks.service'

const taskId = '7d7f0a4e-6c2b-4f1a-9d3e-1b2c3d4e5f60'

describe('TasksService', () => {
  let service: TasksService
  let notifications: NotificationsService
  const findOne = jest.fn<Promise<Task | null>, []>()
  const repository = {
    create: jest.fn((data: Partial<Task>) => data),
    save: jest.fn(async (task: Partial<Task>) => ({
      id: taskId,
      ...task,
    })),
    find: jest.fn(),
    findOne,
    delete: jest.fn(),
    update: jest.fn(async (_criteria: unknown, changes: Partial<Task>) => {
      const task = await findOne()
      if (task) Object.assign(task, changes)
      return { affected: task ? 1 : 0 }
    }),
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    const moduleRef = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: UsersService, useValue: { validateAssignee: jest.fn() } },
        {
          provide: AttachmentsService,
          useValue: { assertOwnReferences: jest.fn() },
        },
        {
          provide: NotificationsService,
          useValue: {
            scheduleTaskReminders: jest.fn(),
            notifyUsers: jest.fn().mockResolvedValue(true),
          },
        },
        ProductivityAdvisorService,
        {
          provide: getRepositoryToken(Task),
          useValue: repository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('20'),
          },
        },
      ],
    }).compile()

    service = moduleRef.get(TasksService)
    notifications = moduleRef.get(NotificationsService)
  })

  it.each(['owner', 'assignee'])(
    'lets the %s reopen a completed task and reset its execution time',
    async (actor) => {
      const dueDate = new Date(Date.now() + 3600000)
      findOne.mockResolvedValue(
        pendingTask({
          assignedToId: 'assignee',
          dueDate,
          status: TaskStatus.Completed,
          startedAt: new Date(Date.now() - 30 * 60000),
          actualTime: 30,
          actualTimeSource: 'timer',
        }),
      )

      const result = await service.setPending(taskId, actor)

      expect(repository.update).toHaveBeenCalledWith(
        [
          { id: taskId, createdById: actor },
          { id: taskId, assignedToId: actor },
        ],
        {
          status: TaskStatus.Pending,
          startedAt: null,
          actualTime: null,
          actualTimeSource: null,
        },
      )
      expect(result.status).toBe(TaskStatus.Pending)
      expect(result.startedAt).toBeNull()
      expect(result.actualTime).toBeNull()
      expect(result.actualTimeSource).toBeNull()
      expect(result.dueDate).toEqual(dueDate)
      expect(notifications.scheduleTaskReminders).toHaveBeenCalledWith(
        expect.objectContaining({
          id: taskId,
          dueDate,
          status: TaskStatus.Pending,
        }),
      )
      expect(notifications.notifyUsers).toHaveBeenCalledWith(
        ['owner', 'assignee'],
        'Tarefa voltou para pendente',
        result.title,
      )

      await service.start(taskId, actor)
      const completed = await service.complete(taskId, {}, actor)
      expect(completed.task.status).toBe(TaskStatus.Completed)
      expect(completed.task.actualTime).toBe(0)
      expect(completed.task.actualTimeSource).toBe('timer')
    },
  )

  it('preserves the timer when returning an unfinished task to pending', async () => {
    const startedAt = new Date(Date.now() - 30 * 60000)
    findOne.mockResolvedValue(
      pendingTask({ status: TaskStatus.InProgress, startedAt }),
    )

    const result = await service.setPending(taskId, 'owner')

    expect(result.status).toBe(TaskStatus.Pending)
    expect(result.startedAt).toEqual(startedAt)
    expect(notifications.scheduleTaskReminders).not.toHaveBeenCalled()
  })

  it('does not reopen tasks that are not visible to the actor', async () => {
    findOne.mockResolvedValue(null)

    await expect(service.setPending(taskId, 'other')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [
          { id: taskId, createdById: 'other' },
          { id: taskId, assignedToId: 'other' },
        ],
      }),
    )
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('returns advice when the informed time exceeds the estimate', async () => {
    repository.findOne.mockResolvedValue(pendingTask())

    const result = await service.complete(taskId, { actualTime: 90 }, 'owner')

    expect(result.task.actualTime).toBe(90)
    expect(result.task.status).toBe(TaskStatus.Completed)
    expect(result.productivityAdvice).toBe(PRODUCTIVITY_ADVICE)
  })

  it('returns no advice when the task finishes inside the margin', async () => {
    repository.findOne.mockResolvedValue(pendingTask())

    const result = await service.complete(taskId, { actualTime: 70 }, 'owner')

    expect(result.productivityAdvice).toBeNull()
  })

  it('measures the elapsed time when the task was started', async () => {
    repository.findOne.mockResolvedValue(
      pendingTask({
        status: TaskStatus.InProgress,
        startedAt: new Date(Date.now() - 30 * 60000),
      }),
    )

    const result = await service.complete(taskId, {}, 'owner')

    expect(result.task.actualTime).toBe(30)
    expect(result.task.actualTimeSource).toBe('timer')
    expect(result.productivityAdvice).toBeNull()
  })

  it('uses the estimate when no start or schedule was recorded', async () => {
    repository.findOne.mockResolvedValue(pendingTask())

    const result = await service.complete(taskId, {}, 'owner')
    expect(result.task.actualTime).toBe(60)
    expect(result.task.actualTimeSource).toBe('estimate')
    expect(result.productivityAdvice).toBeNull()
  })

  it('estimates elapsed time since the scheduled start without issuing productivity advice', async () => {
    findOne.mockResolvedValue(
      pendingTask({ dueDate: new Date(Date.now() - 90 * 60000) }),
    )
    const result = await service.complete(taskId, {}, 'owner')
    expect(result.task.actualTime).toBe(90)
    expect(result.task.actualTimeSource).toBe('schedule')
    expect(result.productivityAdvice).toBeNull()
  })

  it('uses the planned duration if the task is completed before its schedule', async () => {
    findOne.mockResolvedValue(
      pendingTask({ dueDate: new Date(Date.now() + 60000) }),
    )
    const result = await service.complete(taskId, {}, 'owner')
    expect(result.task.actualTime).toBe(60)
    expect(result.task.actualTimeSource).toBe('estimate')
  })

  it('prioritizes the timer over the scheduled date', async () => {
    findOne.mockResolvedValue(
      pendingTask({
        startedAt: new Date(Date.now() - 20 * 60000),
        dueDate: new Date(Date.now() - 90 * 60000),
      }),
    )
    const result = await service.complete(taskId, {}, 'owner')
    expect(result.task.actualTime).toBe(20)
    expect(result.task.actualTimeSource).toBe('timer')
  })

  it('preserves manually entered zero minutes', async () => {
    findOne.mockResolvedValue(pendingTask())
    const result = await service.complete(taskId, { actualTime: 0 }, 'owner')
    expect(result.task.actualTime).toBe(0)
    expect(result.task.actualTimeSource).toBe('manual')
  })

  it('does not recalculate or notify again when an already completed task is retried', async () => {
    findOne.mockResolvedValue(
      pendingTask({
        status: TaskStatus.Completed,
        actualTime: 15,
        actualTimeSource: 'timer',
      }),
    )
    const result = await service.complete(taskId, {}, 'owner')
    expect(result.task.actualTime).toBe(15)
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('throws when the task does not exist', async () => {
    repository.findOne.mockResolvedValue(null)

    await expect(service.findOne(taskId, 'owner')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

function pendingTask(overrides: Partial<Task> = {}): Task {
  return {
    id: taskId,
    createdById: 'owner',
    assignedToId: 'owner',
    title: 'Escrever proposta',
    description: null,
    category: 'Trabalho',
    priority: TaskPriority.Medium,
    color: TaskColor.Blue,
    dueDate: null,
    location: null,
    attachments: [],
    estimatedTime: 60,
    actualTime: null,
    actualTimeSource: null,
    status: TaskStatus.Pending,
    startedAt: null,
    createdAt: new Date('2026-10-29T12:00:00.000Z'),
    updatedAt: new Date('2026-10-29T12:00:00.000Z'),
    ...overrides,
  }
}
