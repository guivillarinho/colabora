import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, QueryFailedError, Repository } from 'typeorm'

import { StartFocusSessionDto } from './dto/start-focus-session.dto'
import { FocusSession } from './entities/focus-session.entity'

@Injectable()
export class FocusSessionsService {
  constructor(
    @InjectRepository(FocusSession)
    private readonly sessionsRepository: Repository<FocusSession>,
  ) {}

  findAll(actor: string): Promise<FocusSession[]> {
    return this.sessionsRepository.find({
      where: { ownerId: actor },
      order: { startedAt: 'DESC' },
    })
  }

  async start(dto: StartFocusSessionDto, actor: string): Promise<FocusSession> {
    const activeSession = await this.sessionsRepository.findOne({
      where: { endedAt: IsNull(), ownerId: actor },
    })

    if (activeSession) {
      throw new ConflictException(
        'Encerre a sessão ativa antes de iniciar outra.',
      )
    }

    const session = this.sessionsRepository.create({
      ownerId: actor,
      title: dto.title?.trim() || 'Foco livre',
      startedAt: new Date(),
      endedAt: null,
    })

    try {
      return await this.sessionsRepository.save(session)
    } catch (cause) {
      if (
        cause instanceof QueryFailedError &&
        (cause.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException(
          'Encerre a sessão ativa antes de iniciar outra.',
        )
      throw cause
    }
  }

  async finish(id: string, actor: string): Promise<FocusSession> {
    const session = await this.sessionsRepository.findOneBy({
      id,
      ownerId: actor,
    })

    if (!session) {
      throw new NotFoundException('Sessão de foco não encontrada.')
    }

    if (session.endedAt) {
      return session
    }

    session.endedAt = new Date()
    return this.sessionsRepository.save(session)
  }
}
