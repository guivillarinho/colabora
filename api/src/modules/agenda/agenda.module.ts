import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AgendaController } from './agenda.controller'
import { AgendaItem } from './entities/agenda-item.entity'
import { AgendaService } from './agenda.service'
import { AgendaFilesController } from './agenda-files.controller'
import { AttachmentsService } from './attachments.service'
import { Attachment } from './entities/attachment.entity'
import { UploadQuotaGuard } from './upload-quota.guard'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([AgendaItem, Attachment]),
    NotificationsModule,
  ],
  controllers: [AgendaController, AgendaFilesController],
  providers: [AgendaService, AttachmentsService, UploadQuotaGuard],
  exports: [AttachmentsService],
})
export class AgendaModule {}
