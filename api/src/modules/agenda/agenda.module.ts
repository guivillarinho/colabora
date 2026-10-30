import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AgendaController } from './agenda.controller'
import { AgendaItem } from './entities/agenda-item.entity'
import { AgendaService } from './agenda.service'

@Module({
  imports: [TypeOrmModule.forFeature([AgendaItem])],
  controllers: [AgendaController],
  providers: [AgendaService],
})
export class AgendaModule {}
