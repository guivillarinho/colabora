import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AgendaItem } from '../agenda/entities/agenda-item.entity'
import { Task } from '../tasks/entities/task.entity'
import { NotificationsController } from './notifications.controller'
import { PushSubscription } from './entities/push-subscription.entity'
import { TaskReminder } from './entities/task-reminder.entity'
import { NotificationsService } from './notifications.service'
import { ReminderWorker } from './reminder-worker.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PushSubscription,
      TaskReminder,
      Task,
      AgendaItem,
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, ReminderWorker],
  exports: [NotificationsService],
})
export class NotificationsModule {}
