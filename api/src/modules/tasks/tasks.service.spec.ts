import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

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
import { CreateTaskDto } from './dto/create-task.dto'
import { UpdateTaskDto } from './dto/update-task.dto'
import { GoogleSyncOrchestrator } from '../google/google-sync.orchestrator'
import { TaskCategoriesService } from './task-categories.service'
import { TasksService } from './tasks.service'

const taskId = '7d7f0a4e-6c2b-4f1a-9d3e-1b2c3d4e5f60'

describe('TasksService', () => {
  let service: TasksService
  let notifications: NotificationsService
  const findOne = jest.fn<Promise<Task | null>, []>()
  const manager = {
    getRepository: () => repository,
    transaction: <T>(callback: (manager: unknown) => Promise<T>): Promise<T> =>
      callback(manager),
  }
  const repository = {
    manager,
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
          provide: TaskCategoriesService,
          useValue: {
            resolveForTask: jest
              .fn()
              .mockImplementation(
                async (
                  _owner: string,
                  _categoryId: string | undefined,
                  category?: string,
                  color?: string,
                ) => ({
                  categoryId: 'cat-1',
                  name: category?.trim() || 'Pessoal',
                  color: color || 'blue',
                }),
              ),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('20'),
          },
        },
        {
          provide: GoogleSyncOrchestrator,
          useValue: { enqueue: jest.fn() },
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
          completedAt: null,
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
        manager,
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

  it('records the finish instant and zero minutes when a timed task starts and ends at 17:00', async () => {
    const sameMinute = new Date('2026-11-06T20:00:00.000Z')
    jest.useFakeTimers({ now: sameMinute })
    try {
      findOne.mockResolvedValue(
        pendingTask({
          status: TaskStatus.InProgress,
          startedAt: sameMinute,
          timed: true,
          estimatedTime: 60,
        }),
      )
      const result = await service.complete(taskId, {}, 'owner')
      expect(result.task.actualTime).toBe(0)
      expect(result.task.actualTimeSource).toBe('timer')
      expect(result.task.completedAt).toEqual(sameMinute)
      expect(result.productivityAdvice).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  it('does not turn a date-only schedule finished at 17:55 Brasília into 20 h 55 min', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-06T20:55:00.000Z') })
    try {
      findOne.mockResolvedValue(
        pendingTask({
          dueDate: new Date('2026-11-06T00:00:00.000Z'),
          estimatedTime: 60,
        }),
      )
      const result = await service.complete(taskId, {}, 'owner')
      expect(result.task.actualTime).toBe(60)
      expect(result.task.actualTimeSource).toBe('estimate')
      expect(result.task.actualTime).not.toBe(20 * 60 + 55)
      expect(result.task.completedAt).toEqual(
        new Date('2026-11-06T20:55:00.000Z'),
      )
    } finally {
      jest.useRealTimers()
    }
  })

  it('marks an immediate task as timed and stores no completion yet', async () => {
    repository.save.mockImplementationOnce(async (task: Partial<Task>) => {
      const saved = pendingTask({ ...task, id: taskId })
      findOne.mockResolvedValue(saved)
      return saved
    })
    const result = await service.create(
      {
        title: 'Revisão',
        category: 'Pessoal',
        color: TaskColor.Blue,
        estimatedTime: 25,
        startImmediately: true,
      } as CreateTaskDto,
      'owner',
    )
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        timed: true,
        dueDate: null,
        completedAt: null,
        status: TaskStatus.InProgress,
      }),
    )
    expect(result.timed).toBe(true)
    expect(result.completedAt).toBeNull()
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

  it('clears a due date and refreshes reminders when the editor removes it', async () => {
    const dueDate = new Date('2026-11-06T12:00:00.000Z')
    findOne.mockResolvedValue(pendingTask({ dueDate }))

    const result = await service.update(
      taskId,
      { dueDate: null } as UpdateTaskDto,
      'owner',
    )

    expect(repository.update).toHaveBeenCalledWith(
      { id: taskId, createdById: 'owner' },
      expect.objectContaining({ dueDate: null }),
    )
    expect(result.dueDate).toBeNull()
    expect(notifications.scheduleTaskReminders).toHaveBeenCalledWith(
      expect.objectContaining({ id: taskId, dueDate: null }),
      manager,
    )
  })

  it('accepts an empty due date on update and rejects text that is not a date', async () => {
    expect(
      await validate(plainToInstance(UpdateTaskDto, { dueDate: null }), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toHaveLength(0)
    expect(
      await validate(plainToInstance(UpdateTaskDto, { dueDate: 'amanhã' }), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).not.toHaveLength(0)
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
    completedAt: null,
    timed: false,
    createdAt: new Date('2026-10-29T12:00:00.000Z'),
    updatedAt: new Date('2026-10-29T12:00:00.000Z'),
    ...overrides,
  }
}
