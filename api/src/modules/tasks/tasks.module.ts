import { Module, forwardRef } from '@nestjs/common'
import { GoogleModule } from '../google/google.module'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Task } from './entities/task.entity'
import { TaskCategory } from './entities/task-category.entity'
import { ProductivityAdvisorService } from './productivity-advisor.service'
import { TaskCategoriesController } from './task-categories.controller'
import { TaskCategoriesService } from './task-categories.service'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'
import { AgendaModule } from '../agenda/agenda.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, TaskCategory]),
    forwardRef(() => AgendaModule),
    NotificationsModule,
    forwardRef(() => GoogleModule),
  ],
  exports: [TasksService, TaskCategoriesService],
  controllers: [TasksController, TaskCategoriesController],
  providers: [TasksService, TaskCategoriesService, ProductivityAdvisorService],
})
export class TasksModule {}
