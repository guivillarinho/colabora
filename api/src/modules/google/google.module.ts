import {
  Body,
  Controller,
  Get,
  Module,
  Post,
  Req,
  Res,
  BadRequestException,
  Header,
} from '@nestjs/common'
import { IsUUID, Equals, IsBoolean } from 'class-validator'
import type { Request, Response } from 'express'
import { CurrentUser } from '../auth/auth.decorators'
import type { Identity } from '../auth/entities/user.entity'
import { TasksModule } from '../tasks/tasks.module'
import { GoogleService } from './google.service'
class SyncDto {
  @IsUUID() taskId: string
  @IsBoolean() @Equals(true) confirmed: boolean
}
@Controller('google')
export class GoogleController {
  constructor(private readonly google: GoogleService) {}
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
}
@Module({
  imports: [TasksModule],
  controllers: [GoogleController],
  providers: [GoogleService],
})
export class GoogleModule {}
