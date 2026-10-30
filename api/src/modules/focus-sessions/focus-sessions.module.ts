import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { FocusSession } from './entities/focus-session.entity'
import { FocusSessionsController } from './focus-sessions.controller'
import { FocusSessionsService } from './focus-sessions.service'

@Module({
  imports: [TypeOrmModule.forFeature([FocusSession])],
  controllers: [FocusSessionsController],
  providers: [FocusSessionsService],
})
export class FocusSessionsModule {}
