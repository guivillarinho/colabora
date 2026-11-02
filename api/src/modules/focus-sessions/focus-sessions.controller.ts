import { CurrentUser } from '../auth/auth.decorators'
import type { Identity } from '../auth/entities/user.entity'
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'

import { StartFocusSessionDto } from './dto/start-focus-session.dto'
import { FocusSessionsService } from './focus-sessions.service'

@Controller('focus-sessions')
export class FocusSessionsController {
  constructor(private readonly focusSessionsService: FocusSessionsService) {}

  @Get()
  findAll(@CurrentUser() user: Identity) {
    return this.focusSessionsService.findAll(user.id)
  }

  @Post()
  start(@Body() dto: StartFocusSessionDto, @CurrentUser() user: Identity) {
    return this.focusSessionsService.start(dto, user.id)
  }

  @Post(':id/finish')
  finish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Identity,
  ) {
    return this.focusSessionsService.finish(id, user.id)
  }
}
