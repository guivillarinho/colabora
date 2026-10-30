import { BadRequestException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'

import { AgendaItem } from './entities/agenda-item.entity'
import { AgendaService } from './agenda.service'

describe('AgendaService', () => {
  let service: AgendaService
  const repository = {
    find: jest.fn(),
    create: jest.fn((item) => item),
    save: jest.fn(async (item) => item),
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        AgendaService,
        { provide: getRepositoryToken(AgendaItem), useValue: repository },
      ],
    }).compile()
    service = module.get(AgendaService)
  })

  it('creates agenda events with optional metadata normalized', async () => {
    const result = await service.create({
      title: 'Revisão',
      type: 'event',
      startDate: '2026-10-30T10:00:00.000Z',
      endDate: '2026-10-30T11:00:00.000Z',
      attachments: ['brief.pdf'],
    })

    expect(result.title).toBe('Revisão')
    expect(result.attachments).toEqual(['brief.pdf'])
    expect(result.location).toBeNull()
  })

  it('rejects an end date earlier than the start date', async () => {
    await expect(
      Promise.resolve().then(() =>
        service.create({
          title: 'Invalid date range',
          type: 'project',
          startDate: '2026-10-31T10:00:00.000Z',
          endDate: '2026-10-30T10:00:00.000Z',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(repository.save).not.toHaveBeenCalled()
  })
})
