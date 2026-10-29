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
  const repository = {
    create: jest.fn((data: Partial<Task>) => data),
    save: jest.fn(async (task: Partial<Task>) => ({
      id: taskId,
      ...task,
    })),
    find: jest.fn(),
    findOneBy: jest.fn(),
    delete: jest.fn(),
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    const moduleRef = await Test.createTestingModule({
      providers: [
        TasksService,
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
    repository.findOneBy.mockResolvedValue(pendingTask())

    const result = await service.complete(taskId, { actualTime: 90 })

    expect(result.task.actualTime).toBe(90)
    expect(result.task.status).toBe(TaskStatus.Completed)
    expect(result.productivityAdvice).toBe(PRODUCTIVITY_ADVICE)
  })

  it('returns no advice when the task finishes inside the margin', async () => {
    repository.findOneBy.mockResolvedValue(pendingTask())

    const result = await service.complete(taskId, { actualTime: 70 })

    expect(result.productivityAdvice).toBeNull()
  })

  it('measures the elapsed time when the task was started', async () => {
    repository.findOneBy.mockResolvedValue(
      pendingTask({
        status: TaskStatus.InProgress,
        startedAt: new Date(Date.now() - 30 * 60000),
      }),
    )

    const result = await service.complete(taskId, {})

    expect(result.task.actualTime).toBe(30)
    expect(result.productivityAdvice).toBeNull()
  })

  it('asks for the actual time when the task was never started', async () => {
    repository.findOneBy.mockResolvedValue(pendingTask())

    await expect(service.complete(taskId, {})).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('throws when the task does not exist', async () => {
    repository.findOneBy.mockResolvedValue(null)

    await expect(service.findOne(taskId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

function pendingTask(overrides: Partial<Task> = {}): Task {
  return {
    id: taskId,
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
