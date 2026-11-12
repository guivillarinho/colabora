import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'

import { CurrentUser } from '../auth/auth.decorators'
import type { Identity } from '../auth/entities/user.entity'
import { CreateTaskCategoryDto } from './dto/create-task-category.dto'
import { UpdateTaskCategoryDto } from './dto/update-task-category.dto'
import { TaskCategoriesService } from './task-categories.service'

@Controller('task-categories')
export class TaskCategoriesController {
  constructor(private readonly categories: TaskCategoriesService) {}

  @Get()
  list(@CurrentUser() user: Identity) {
    return this.categories.list(user.id)
  }

  @Post()
  create(@CurrentUser() user: Identity, @Body() dto: CreateTaskCategoryDto) {
    return this.categories.create(dto, user.id)
  }

  @Patch(':id')
  update(
    @CurrentUser() user: Identity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskCategoryDto,
  ) {
    return this.categories.update(id, dto, user.id)
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: Identity,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('reassignToId') reassignToId?: string,
  ) {
    await this.categories.remove(id, user.id, reassignToId)
  }
}
