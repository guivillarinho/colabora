import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Task } from './entities/task.entity'
import { ProductivityAdvisorService } from './productivity-advisor.service'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'
import { AgendaModule } from '../agenda/agenda.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Task]),
    AgendaModule,
    NotificationsModule,
  ],
  exports: [TasksService],
  controllers: [TasksController],
  providers: [TasksService, ProductivityAdvisorService],
})
export class TasksModule {}
