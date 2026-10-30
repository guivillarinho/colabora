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
  findAll() {
    return this.focusSessionsService.findAll()
  }

  @Post()
  start(@Body() dto: StartFocusSessionDto) {
    return this.focusSessionsService.start(dto)
  }

  @Post(':id/finish')
  finish(@Param('id', ParseUUIDPipe) id: string) {
    return this.focusSessionsService.finish(id)
  }
}
