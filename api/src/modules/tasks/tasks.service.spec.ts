import { UsersService } from '../auth/users.service'
import { AttachmentsService } from '../agenda/attachments.service'
import { NotificationsService } from '../notifications/notifications.service'
import { BadRequestException, NotFoundException } from '@nestjs/common'
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
    expect(result.productivityAdvice).toBeNull()
  })

  it('asks for the actual time when the task was never started', async () => {
    repository.findOne.mockResolvedValue(pendingTask())

    await expect(service.complete(taskId, {}, 'owner')).rejects.toBeInstanceOf(
      BadRequestException,
    )
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
    status: TaskStatus.Pending,
    startedAt: null,
    createdAt: new Date('2026-10-29T12:00:00.000Z'),
    updatedAt: new Date('2026-10-29T12:00:00.000Z'),
    ...overrides,
  }
}
