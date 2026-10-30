import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'

import { StartFocusSessionDto } from './dto/start-focus-session.dto'
import { FocusSession } from './entities/focus-session.entity'

@Injectable()
export class FocusSessionsService {
  constructor(
    @InjectRepository(FocusSession)
    private readonly sessionsRepository: Repository<FocusSession>,
  ) {}

  findAll(): Promise<FocusSession[]> {
    return this.sessionsRepository.find({ order: { startedAt: 'DESC' } })
  }

  async start(dto: StartFocusSessionDto): Promise<FocusSession> {
    const activeSession = await this.sessionsRepository.findOne({
      where: { endedAt: IsNull() },
    })

    if (activeSession) {
      throw new ConflictException(
        'Encerre a sessão ativa antes de iniciar outra.',
      )
    }

    const session = this.sessionsRepository.create({
      title: dto.title?.trim() || 'Foco livre',
      startedAt: new Date(),
      endedAt: null,
    })

    return this.sessionsRepository.save(session)
  }

  async finish(id: string): Promise<FocusSession> {
    const session = await this.sessionsRepository.findOneBy({ id })

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
