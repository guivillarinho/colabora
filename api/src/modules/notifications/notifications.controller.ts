import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { timingSafeEqual } from 'node:crypto'

import { CurrentUser, MachineRequest, Public } from '../auth/auth.decorators'
import type { Identity } from '../auth/entities/user.entity'
import {
  PushSubscriptionDto,
  RemovePushSubscriptionDto,
} from './notifications.dto'
import { NotificationsService } from './notifications.service'

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Get('vapid-public-key')
  publicKey() {
    return { publicKey: this.notifications.publicKey() }
  }

  @Post('subscriptions')
  @HttpCode(204)
  async subscribe(
    @CurrentUser() user: Identity,
    @Body() dto: PushSubscriptionDto,
  ): Promise<void> {
    await this.notifications.saveSubscription(user.id, dto)
  }

  @Delete('subscriptions')
  @HttpCode(204)
  async unsubscribe(
    @CurrentUser() user: Identity,
    @Body() dto: RemovePushSubscriptionDto,
  ): Promise<void> {
    await this.notifications.removeSubscription(user.id, dto.endpoint)
  }

  @Post('dispatch-reminders')
  @Public()
  @MachineRequest()
  @HttpCode(200)
  dispatchReminders(
    @Headers('authorization') authorization: string | undefined,
  ) {
    const secret = this.config.get<string>('REMINDER_DISPATCH_SECRET')
    if (!secret || !this.matchesSecret(authorization, secret))
      throw new UnauthorizedException()
    return this.notifications.dispatchDueReminders()
  }

  private matchesSecret(value: string | undefined, expected: string): boolean {
    const token = value?.replace(/^Bearer\s+/i, '')
    if (!token || token.length !== expected.length) return false
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  }
}
