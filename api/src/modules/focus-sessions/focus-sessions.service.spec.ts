import { ConflictException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'

import { FocusSession } from './entities/focus-session.entity'
import { FocusSessionsService } from './focus-sessions.service'

const sessionId = '7d7f0a4e-6c2b-4f1a-9d3e-1b2c3d4e5f60'

describe('FocusSessionsService', () => {
  let service: FocusSessionsService
  const repository = {
    create: jest.fn((data: Partial<FocusSession>) => data),
    save: jest.fn(async (session: Partial<FocusSession>) => ({
      id: sessionId,
      ...session,
    })),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    const moduleRef = await Test.createTestingModule({
      providers: [
        FocusSessionsService,
        {
          provide: getRepositoryToken(FocusSession),
          useValue: repository,
        },
      ],
    }).compile()

    service = moduleRef.get(FocusSessionsService)
  })

  it('starts a named focus session when no other session is active', async () => {
    repository.findOne.mockResolvedValue(null)

    const result = await service.start({ title: 'Escrever proposta' })

    expect(result.title).toBe('Escrever proposta')
    expect(result.startedAt).toBeInstanceOf(Date)
    expect(result.endedAt).toBeNull()
  })

  it('uses a default title when the session name is empty', async () => {
    repository.findOne.mockResolvedValue(null)

    const result = await service.start({ title: '  ' })

    expect(result.title).toBe('Foco livre')
  })

  it('prevents starting a second active session', async () => {
    repository.findOne.mockResolvedValue({ id: sessionId })

    await expect(service.start({})).rejects.toBeInstanceOf(ConflictException)
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('finishes an active session', async () => {
    repository.findOneBy.mockResolvedValue({
      id: sessionId,
      title: 'Escrever proposta',
      startedAt: new Date(Date.now() - 10_000),
      endedAt: null,
    })

    const result = await service.finish(sessionId)

    expect(result.endedAt).toBeInstanceOf(Date)
  })

  it('returns an already-finished session without changing it', async () => {
    const endedAt = new Date()
    repository.findOneBy.mockResolvedValue({
      id: sessionId,
      endedAt,
    })

    const result = await service.finish(sessionId)

    expect(result.endedAt).toBe(endedAt)
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('returns not found when finishing an unknown session', async () => {
    repository.findOneBy.mockResolvedValue(null)

    await expect(service.finish(sessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
