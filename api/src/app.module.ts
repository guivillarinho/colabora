import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AgendaModule } from './modules/agenda/agenda.module'
import { DatabaseModule } from './database/database.module'
import { FocusSessionsModule } from './modules/focus-sessions/focus-sessions.module'
import { TasksModule } from './modules/tasks/tasks.module'
import { AuthModule } from './modules/auth/auth.module'
import { NotificationsModule } from './modules/notifications/notifications.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    NotificationsModule,
    FocusSessionsModule,
    AgendaModule,
    TasksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
