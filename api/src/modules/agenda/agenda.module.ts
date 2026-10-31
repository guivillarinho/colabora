import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AgendaController } from './agenda.controller'
import { AgendaItem } from './entities/agenda-item.entity'
import { AgendaService } from './agenda.service'
import { AgendaFilesController } from './agenda-files.controller'

@Module({
  imports: [TypeOrmModule.forFeature([AgendaItem])],
  controllers: [AgendaController, AgendaFilesController],
  providers: [AgendaService],
})
export class AgendaModule {}
