import { Test } from '@nestjs/testing'
import { ModuleRef } from '@nestjs/core'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { Task } from './entities/task.entity'
import { TaskCategory } from './entities/task-category.entity'
import { TaskCategoriesService } from './task-categories.service'
import { TaskColor } from './task-color.enum'

describe('TaskCategoriesService', () => {
  let service: TaskCategoriesService
  const categories = {
    count: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value) => value),
    createQueryBuilder: jest.fn(),
  }
  const tasks = {
    count: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  }
  const source = { query: jest.fn() }

  beforeEach(async () => {
    jest.clearAllMocks()
    const moduleRef = await Test.createTestingModule({
      providers: [
        TaskCategoriesService,
        { provide: DataSource, useValue: source },
        { provide: getRepositoryToken(TaskCategory), useValue: categories },
        { provide: getRepositoryToken(Task), useValue: tasks },
        { provide: ModuleRef, useValue: { get: jest.fn() } },
      ],
    }).compile()
    service = moduleRef.get(TaskCategoriesService)
  })

  it('seeds default categories when catalog is empty', async () => {
    categories.count.mockResolvedValue(0)
    categories.save.mockResolvedValue([])
    tasks.createQueryBuilder.mockReturnValue({
      where: () => ({
        andWhere: () => ({
          getMany: jest.fn().mockResolvedValue([]),
        }),
      }),
    })
    categories.find.mockResolvedValue([
      { id: '1', name: 'Pessoal', color: TaskColor.Blue },
    ])
    await service.list('owner-1')
    expect(source.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO task_categories'),
      ['owner-1', expect.any(String)],
    )
    expect(categories.find).toHaveBeenCalled()
  })
})
