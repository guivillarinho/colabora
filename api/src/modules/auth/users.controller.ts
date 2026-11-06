import {
  Body,
  Controller,
  Get,
  Query,
  Patch,
  Param,
  ParseUUIDPipe,
  Header,
  StreamableFile,
} from '@nestjs/common'
import { IsString, Length } from 'class-validator'
import { CurrentUser } from './auth.decorators'
import type { Identity } from './entities/user.entity'
import { UsersService } from './users.service'

import { PreferencesDto } from './dto/preferences.dto'
import { AvatarService } from './avatar.service'

class SearchUsersDto {
  @IsString()
  @Length(3, 254)
  query: string
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly avatars: AvatarService,
  ) {}

  @Patch('me/preferences')
  updatePreferences(
    @CurrentUser() user: Identity,
    @Body() dto: PreferencesDto,
  ) {
    return this.users.updatePreferences(user.id, dto)
  }

  @Get('directory/:id/avatar')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  async avatar(@Param('id', ParseUUIDPipe) id: string) {
    const file = await this.avatars.open(id)
    return new StreamableFile(file.stream, {
      type: file.contentType,
      disposition: `inline; filename="${file.downloadName}"`,
    })
  }

  @Get()
  search(@Query() dto: SearchUsersDto, @CurrentUser() user: Identity) {
    return this.users.search(dto.query, user.id)
  }
}
