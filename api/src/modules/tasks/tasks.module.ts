import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Task } from './entities/task.entity'
import { ProductivityAdvisorService } from './productivity-advisor.service'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'

@Module({
  imports: [TypeOrmModule.forFeature([Task])],
  controllers: [TasksController],
  providers: [TasksService, ProductivityAdvisorService],
})
export class TasksModule {}
