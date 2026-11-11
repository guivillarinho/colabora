import { Module, forwardRef } from '@nestjs/common'
import { GoogleModule } from '../google/google.module'
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
    forwardRef(() => GoogleModule),
  ],
  controllers: [AgendaController, AgendaFilesController],
  providers: [AgendaService, AttachmentsService, UploadQuotaGuard],
  exports: [AttachmentsService],
})
export class AgendaModule {}
