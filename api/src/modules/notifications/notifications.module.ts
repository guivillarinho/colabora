import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Task } from '../tasks/entities/task.entity'
import { NotificationsController } from './notifications.controller'
import { PushSubscription } from './entities/push-subscription.entity'
import { TaskReminder } from './entities/task-reminder.entity'
import { NotificationsService } from './notifications.service'

@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription, TaskReminder, Task])],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
