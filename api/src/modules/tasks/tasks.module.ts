import { Module, forwardRef } from '@nestjs/common'
import { GoogleModule } from '../google/google.module'
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
    forwardRef(() => AgendaModule),
    NotificationsModule,
    forwardRef(() => GoogleModule),
  ],
  exports: [TasksService],
  controllers: [TasksController],
  providers: [TasksService, ProductivityAdvisorService],
})
export class TasksModule {}
