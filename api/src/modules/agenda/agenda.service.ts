import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CreateAgendaItemDto } from './dto/create-agenda-item.dto'
import { AttachmentsService } from './attachments.service'
import { AgendaItem } from './entities/agenda-item.entity'
import { validateReminderTimes } from '../notifications/reminder-options'
import { NotificationsService } from '../notifications/notifications.service'

@Injectable()
export class AgendaService {
  constructor(
    @InjectRepository(AgendaItem)
    private readonly items: Repository<AgendaItem>,
    private readonly attachments: AttachmentsService,
    private readonly notifications: NotificationsService,
  ) {}

  findAll(actor: string): Promise<AgendaItem[]> {
    return this.items.find({
      where: { ownerId: actor },
      order: { startDate: 'ASC' },
    })
  }

  async remove(id: string, actor: string): Promise<void> {
    const item = await this.items.findOneBy({ id, ownerId: actor })
    if (!item) throw new NotFoundException('Evento ou projeto não encontrado.')
    const result = await this.items.delete({ id, ownerId: actor })
    if (!result.affected) {
      throw new NotFoundException('Evento ou projeto não encontrado.')
    }
    await this.notifications.notifyUsers(
      [actor],
      item.type === 'project' ? 'Projeto removido' : 'Evento removido',
      item.title,
    )
  }

  async create(dto: CreateAgendaItemDto, actor: string): Promise<AgendaItem> {
    const startDate = new Date(dto.startDate)
    const endDate = new Date(dto.endDate)

    if (endDate < startDate) {
      throw new BadRequestException(
        'A data final deve ser posterior à inicial.',
      )
    }

    validateReminderTimes(startDate, dto.reminderOffsets)
    await this.attachments.assertOwnReferences(dto.attachments ?? [], actor)
    const entity = this.items.create({
      ...dto,
      ownerId: actor,
      description: dto.description?.trim() || null,
      location: dto.location?.trim() || null,
      icon: dto.icon?.trim() || null,
      attachments: dto.attachments ?? [],
      startDate,
      endDate,
    })
    const item = await this.items.manager.transaction(async (manager) => {
      const saved = await manager.getRepository(AgendaItem).save(entity)
      await this.notifications.scheduleAgendaReminders(saved, manager)
      return saved
    })
    await this.notifications.notifyUsers(
      [actor],
      item.type === 'project'
        ? 'Projeto adicionado à agenda'
        : 'Evento adicionado à agenda',
      item.title,
    )
    return item
  }
}
