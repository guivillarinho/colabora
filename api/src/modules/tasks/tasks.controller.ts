import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common'

import { CompleteTaskDto } from './dto/complete-task.dto'
import { CreateTaskDto } from './dto/create-task.dto'
import { UpdateTaskDto } from './dto/update-task.dto'
import { CurrentUser } from '../auth/auth.decorators'
import type { Identity } from '../auth/entities/user.entity'
import { IsIn } from 'class-validator'
import { AvatarService } from '../auth/avatar.service'

import { TaskCompletion, TasksService } from './tasks.service'

class StatusDto {
  @IsIn(['pending', 'in_progress'])
  status: 'pending' | 'in_progress'
}

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly avatars: AvatarService,
  ) {}

  @Get(':id/assignee/avatar')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  async assigneeAvatar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Identity,
  ) {
    const task = await this.tasksService.findOne(id, user.id)
    if (!task.assignedToId) throw new NotFoundException('Foto não encontrada.')
    const file = await this.avatars.open(task.assignedToId)
    return new StreamableFile(file.stream, {
      type: file.contentType,
      disposition: `inline; filename="${file.downloadName}"`,
    })
  }

  @Post()
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: Identity) {
    return this.tasksService.create(dto, user.id)
  }

  @Get()
  findAll(@CurrentUser() user: Identity) {
    return this.tasksService.findAll(user.id)
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Identity,
  ) {
    return this.tasksService.findOne(id, user.id)
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: Identity,
  ) {
    return this.tasksService.update(id, dto, user.id)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Identity,
  ) {
    return this.tasksService.remove(id, user.id)
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
    @CurrentUser() user: Identity,
  ) {
    return dto.status === 'pending'
      ? this.tasksService.setPending(id, user.id)
      : this.tasksService.start(id, user.id)
  }

  @Post(':id/start')
  @HttpCode(200)
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: Identity) {
    return this.tasksService.start(id, user.id)
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteTaskDto,
    @CurrentUser() user: Identity,
  ): Promise<TaskCompletion> {
    return this.tasksService.complete(id, dto, user.id)
  }
}
