import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Module,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  forwardRef,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IsUUID, Equals, IsBoolean } from 'class-validator'
import { timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { CurrentUser, MachineRequest, Public } from '../auth/auth.decorators'
import type { Identity } from '../auth/entities/user.entity'
import { TasksModule } from '../tasks/tasks.module'
import { GooglePreferencesDto } from './dto/google-preferences.dto'
import { GoogleCalendarClient } from './google-calendar.client'
import { GoogleInboundService } from './google-inbound.service'
import { googlePreferences } from './google-preferences'
import { GoogleService } from './google.service'
import { GoogleSyncOrchestrator } from './google-sync.orchestrator'
import { GoogleSyncWorker } from './google-sync.worker'
import { GoogleTasksClient } from './google-tasks.client'
class SyncDto {
  @IsUUID() taskId: string
  @IsBoolean() @Equals(true) confirmed: boolean
}
@Controller('google')
export class GoogleController {
  constructor(
    private readonly google: GoogleService,
    private readonly outbound: GoogleSyncOrchestrator,
    private readonly inbound: GoogleInboundService,
    private readonly worker: GoogleSyncWorker,
    private readonly config: ConfigService,
  ) {}

  @Get('status') status(@CurrentUser() user: Identity) {
    return this.google.status(user.id)
  }

  @Post('connect') async connect(
    @CurrentUser() user: Identity,
    @Req() request: Request,
  ) {
    const result = await this.google.start(user.id)
    request.session.googleOAuth = result.pending
    await new Promise<void>((resolve, reject) =>
      request.session.save((error) => (error ? reject(error) : resolve())),
    )
    return { url: result.url }
  }

  @Get('callback')
  @Header('Referrer-Policy', 'no-referrer')
  async callback(
    @CurrentUser() user: Identity,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const pending = request.session.googleOAuth
    delete request.session.googleOAuth
    await new Promise<void>((resolve, reject) =>
      request.session.save((error) => (error ? reject(error) : resolve())),
    )
    const { state, code, error } = request.query
    if (
      typeof state !== 'string' ||
      (code !== undefined && typeof code !== 'string') ||
      (error !== undefined && typeof error !== 'string') ||
      state.length > 128 ||
      (typeof code === 'string' && code.length > 4096) ||
      (typeof error === 'string' && error.length > 128)
    )
      throw new BadRequestException(
        'Google não autorizou o vínculo. Volte ao perfil e tente novamente.',
      )
    try {
      response.redirect(
        await this.google.callback(user.id, pending, state, code ?? '', error),
      )
    } catch {
      response.redirect(this.google.profileUrl('error'))
    }
  }

  @Post('disconnect') disconnect(@CurrentUser() user: Identity) {
    return this.google.disconnect(user.id)
  }

  @Post('sync') sync(@CurrentUser() user: Identity, @Body() dto: SyncDto) {
    return this.google.sync(user.id, dto.taskId)
  }

  @Post('sync-now')
  @HttpCode(200)
  async syncNow(@CurrentUser() user: Identity) {
    try {
      const result = await this.outbound.syncNow(user.id)
      if (!result.ok)
        throw new ConflictException('Vincule sua conta Google primeiro.')
      return result
    } catch (error) {
      if (error instanceof ConflictException) throw error
      throw new BadRequestException(
        'Não foi possível sincronizar com o Google.',
      )
    }
  }

  @Patch('preferences')
  async preferences(
    @CurrentUser() user: Identity,
    @Body() dto: GooglePreferencesDto,
  ) {
    const saved = await this.outbound.savePreferences(
      user.id,
      googlePreferences(dto),
    )
    if (!saved)
      throw new ConflictException('Vincule sua conta Google primeiro.')
    return { saved: true }
  }

  @Get('calendars')
  calendars(@CurrentUser() user: Identity) {
    return this.outbound.calendars(user.id)
  }

  @Get('tasklists')
  tasklists(@CurrentUser() user: Identity) {
    return this.outbound.tasklists(user.id)
  }

  @Post('webhook/calendar')
  @Public()
  @MachineRequest()
  @HttpCode(200)
  async webhook(@Req() request: Request) {
    const accepted = await this.inbound.acceptWebhook(request.headers)
    if (!accepted) throw new UnauthorizedException()
    await this.worker.tick()
    return { received: true }
  }

  @Get('jobs/tick')
  @Public()
  @MachineRequest()
  @HttpCode(200)
  jobsGet(@Headers('authorization') authorization: string | undefined) {
    return this.jobs(authorization)
  }

  @Post('jobs/tick')
  @Public()
  @MachineRequest()
  @HttpCode(200)
  jobsPost(@Headers('authorization') authorization: string | undefined) {
    return this.jobs(authorization)
  }

  private jobs(authorization: string | undefined) {
    const secret =
      this.config.get<string>('CRON_SECRET') ||
      this.config.get<string>('REMINDER_DISPATCH_SECRET')
    const token = authorization?.replace(/^Bearer\s+/i, '')
    if (
      !secret ||
      !token ||
      token.length !== secret.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(secret))
    )
      throw new UnauthorizedException()
    return this.worker.tick()
  }
}
@Module({
  imports: [forwardRef(() => TasksModule)],
  controllers: [GoogleController],
  providers: [
    GoogleService,
    GoogleTasksClient,
    GoogleCalendarClient,
    GoogleSyncOrchestrator,
    GoogleInboundService,
    GoogleSyncWorker,
  ],
  exports: [GoogleSyncOrchestrator],
})
export class GoogleModule {}
