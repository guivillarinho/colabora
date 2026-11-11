import { AttachmentsService } from './attachments.service'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'

import { AgendaItem } from './entities/agenda-item.entity'
import { AgendaService } from './agenda.service'
import { NotificationsService } from '../notifications/notifications.service'

describe('AgendaService', () => {
  let service: AgendaService
  const manager = {
    getRepository: () => repository,
    transaction: <T>(callback: (manager: unknown) => Promise<T>): Promise<T> =>
      callback(manager),
  }
  const repository = {
    manager,
    find: jest.fn(),
    findOneBy: jest.fn(async () => ({
      id: 'item-1',
      title: 'Revisão',
      type: 'event',
      startDate: new Date('2026-10-30T10:00:00.000Z'),
      endDate: new Date('2026-10-30T11:00:00.000Z'),
      reminderOffsets: [],
    })),
    findOneByOrFail: jest.fn(async () => ({
      id: 'item-1',
      title: 'Revisão atualizada',
      type: 'event',
    })),
    create: jest.fn((item) => item),
    save: jest.fn(async (item) => item),
    update: jest.fn(async () => ({ affected: 1 })),
    delete: jest.fn(),
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        AgendaService,
        {
          provide: AttachmentsService,
          useValue: { assertOwnReferences: jest.fn() },
        },
        {
          provide: NotificationsService,
          useValue: {
            notifyUsers: jest.fn().mockResolvedValue(true),
            scheduleAgendaReminders: jest.fn(),
          },
        },
        { provide: getRepositoryToken(AgendaItem), useValue: repository },
      ],
    }).compile()
    service = module.get(AgendaService)
  })

  it('creates agenda events with optional metadata normalized', async () => {
    const result = await service.create(
      {
        title: 'Revisão',
        type: 'event',
        startDate: '2026-10-30T10:00:00.000Z',
        endDate: '2026-10-30T11:00:00.000Z',
        attachments: ['brief.pdf'],
      },
      'owner',
    )

    expect(result.title).toBe('Revisão')
    expect(result.attachments).toEqual(['brief.pdf'])
    expect(result.location).toBeNull()
  })

  it.each(['event', 'project'] as const)(
    'enqueues reminders from the start of a %s and rejects an elapsed reminder',
    async (type) => {
      const now = Date.now()
      const input = {
        title: 'Revisão',
        type,
        startDate: new Date(now + 40 * 60_000).toISOString(),
        endDate: new Date(now + 60 * 60_000).toISOString(),
      }
      await expect(
        service.create({ ...input, reminderOffsets: [60] }, 'owner'),
      ).rejects.toThrow('horário de envio no futuro')
      expect(repository.save).not.toHaveBeenCalled()
      const item = await service.create(
        { ...input, reminderOffsets: [30, 5] },
        'owner',
      )
      expect(item.reminderOffsets).toEqual([30, 5])
    },
  )

  it('rejects an end date earlier than the start date', async () => {
    await expect(
      Promise.resolve().then(() =>
        service.create(
          {
            title: 'Invalid date range',
            type: 'project',
            startDate: '2026-10-31T10:00:00.000Z',
            endDate: '2026-10-30T10:00:00.000Z',
          },
          'owner',
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('updates an agenda item and keeps the owner filter', async () => {
    const result = await service.update(
      'item-1',
      { title: 'Revisão atualizada' },
      'owner',
    )
    expect(repository.update).toHaveBeenCalledWith(
      { id: 'item-1', ownerId: 'owner' },
      { title: 'Revisão atualizada' },
    )
    expect(result.title).toBe('Revisão atualizada')
  })

  it('removes an agenda item', async () => {
    repository.delete.mockResolvedValue({ affected: 1 })
    await expect(service.remove('item-1', 'owner')).resolves.toBeUndefined()
    expect(repository.delete).toHaveBeenCalledWith({
      id: 'item-1',
      ownerId: 'owner',
    })
  })

  it('reports when the item does not exist', async () => {
    repository.findOneBy.mockResolvedValueOnce(null)
    repository.delete.mockResolvedValue({ affected: 0 })
    await expect(service.remove('missing', 'owner')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
