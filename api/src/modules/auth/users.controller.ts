import { Controller, Get, Query } from '@nestjs/common'
import { IsString, Length } from 'class-validator'
import { CurrentUser } from './auth.decorators'
import type { Identity } from './entities/user.entity'
import { UsersService } from './users.service'

class SearchUsersDto {
  @IsString()
  @Length(3, 254)
  query: string
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  search(@Query() dto: SearchUsersDto, @CurrentUser() user: Identity) {
    return this.users.search(dto.query, user.id)
  }
}
