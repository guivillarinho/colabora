import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CreateAgendaItemDto } from './dto/create-agenda-item.dto'
import { AgendaItem } from './entities/agenda-item.entity'

@Injectable()
export class AgendaService {
  constructor(
    @InjectRepository(AgendaItem)
    private readonly items: Repository<AgendaItem>,
  ) {}

  findAll(): Promise<AgendaItem[]> {
    return this.items.find({ order: { startDate: 'ASC' } })
  }

  create(dto: CreateAgendaItemDto): Promise<AgendaItem> {
    const startDate = new Date(dto.startDate)
    const endDate = new Date(dto.endDate)

    if (endDate < startDate) {
      throw new BadRequestException(
        'A data final deve ser posterior à inicial.',
      )
    }

    return this.items.save(
      this.items.create({
        ...dto,
        description: dto.description?.trim() || null,
        location: dto.location?.trim() || null,
        icon: dto.icon?.trim() || null,
        attachments: dto.attachments ?? [],
        startDate,
        endDate,
      }),
    )
  }
}
