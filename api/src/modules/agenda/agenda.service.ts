import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CreateAgendaItemDto } from './dto/create-agenda-item.dto'
import { UpdateAgendaItemDto } from './dto/update-agenda-item.dto'
import { GoogleSyncOrchestrator } from '../google/google-sync.orchestrator'
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
    @Optional()
    @Inject(forwardRef(() => GoogleSyncOrchestrator))
    private readonly googleSync?: GoogleSyncOrchestrator,
  ) {}

  private async mirror(
    ownerId: string,
    operation: string,
    payload: Record<string, string>,
  ) {
    if (!this.googleSync) return
    try {
      await this.googleSync.enqueue(ownerId, operation, payload)
    } catch {
      // A gravação local já foi confirmada. A fila tenta de novo.
    }
  }

  findAll(actor: string): Promise<AgendaItem[]> {
    return this.items.find({
      where: { ownerId: actor },
      order: { startDate: 'ASC' },
    })
  }

  async remove(id: string, actor: string): Promise<void> {
    const item = await this.items.findOneBy({ id, ownerId: actor })
    if (!item) throw new NotFoundException('Evento ou projeto não encontrado.')
    await this.mirror(actor, 'delete-agenda', {
      entityType: 'agenda_item',
      entityId: id,
    })
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
    const fields = { ...dto }
    delete fields.syncOptOut
    const entity = this.items.create({
      ...fields,
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
    if (!dto.syncOptOut)
      await this.mirror(actor, 'push-agenda', { agendaId: item.id })
    return item
  }

  async update(
    id: string,
    dto: UpdateAgendaItemDto,
    actor: string,
  ): Promise<AgendaItem> {
    const current = await this.items.findOneBy({ id, ownerId: actor })
    if (!current)
      throw new NotFoundException('Evento ou projeto não encontrado.')
    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : current.startDate
    const endDate = dto.endDate ? new Date(dto.endDate) : current.endDate
    if (endDate < startDate) {
      throw new BadRequestException(
        'A data final deve ser posterior à inicial.',
      )
    }
    if (dto.reminderOffsets)
      validateReminderTimes(
        startDate,
        dto.reminderOffsets,
        current.startDate,
        current.reminderOffsets ?? [],
      )
    if (dto.attachments)
      await this.attachments.assertOwnReferences(dto.attachments, actor)
    const item = await this.items.manager.transaction(async (manager) => {
      const repository = manager.getRepository(AgendaItem)
      await repository.update(
        { id, ownerId: actor },
        {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.location !== undefined
            ? { location: dto.location?.trim() || null }
            : {}),
          ...(dto.icon !== undefined ? { icon: dto.icon?.trim() || null } : {}),
          ...(dto.attachments !== undefined
            ? { attachments: dto.attachments }
            : {}),
          ...(dto.reminderOffsets !== undefined
            ? { reminderOffsets: dto.reminderOffsets }
            : {}),
          ...(dto.startDate !== undefined ? { startDate } : {}),
          ...(dto.endDate !== undefined ? { endDate } : {}),
        },
      )
      const saved = await repository.findOneByOrFail({ id, ownerId: actor })
      await this.notifications.scheduleAgendaReminders(saved, manager)
      return saved
    })
    if (!dto.syncOptOut)
      await this.mirror(actor, 'push-agenda', { agendaId: id })
    return item
  }
}
