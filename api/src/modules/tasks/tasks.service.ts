import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CompleteTaskDto } from './dto/complete-task.dto'
import { CreateTaskDto } from './dto/create-task.dto'
import { UpdateTaskDto } from './dto/update-task.dto'
import { Task } from './entities/task.entity'
import { ProductivityAdvisorService } from './productivity-advisor.service'
import { TaskPriority } from './task-priority.enum'
import { TaskStatus } from './task-status.enum'

export type TaskCompletion = {
  task: Task
  productivityAdvice: string | null
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    private readonly productivityAdvisor: ProductivityAdvisorService,
  ) {}

  async create(dto: CreateTaskDto): Promise<Task> {
    const task = this.tasksRepository.create({
      title: dto.title.trim(),
      description: emptyToNull(dto.description),
      category: dto.category.trim(),
      priority: dto.priority ?? TaskPriority.Medium,
      color: dto.color,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      location: emptyToNull(dto.location),
      attachments: dto.attachments ?? [],
      estimatedTime: dto.estimatedTime,
      actualTime: null,
      status: dto.startImmediately ? TaskStatus.InProgress : TaskStatus.Pending,
      startedAt: dto.startImmediately ? new Date() : null,
    })

    return this.tasksRepository.save(task)
  }

  findAll(): Promise<Task[]> {
    return this.tasksRepository.find({
      order: { createdAt: 'DESC' },
    })
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.tasksRepository.findOneBy({ id })

    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.')
    }

    return task
  }

  async update(id: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(id)

    if (dto.title !== undefined) {
      task.title = dto.title.trim()
    }

    if (dto.description !== undefined) {
      task.description = emptyToNull(dto.description)
    }

    if (dto.category !== undefined) {
      task.category = dto.category.trim()
    }

    if (dto.priority !== undefined) {
      task.priority = dto.priority
    }

    if (dto.color !== undefined) {
      task.color = dto.color
    }

    if (dto.dueDate !== undefined) {
      task.dueDate = new Date(dto.dueDate)
    }

    if (dto.location !== undefined) {
      task.location = emptyToNull(dto.location)
    }

    if (dto.attachments !== undefined) {
      task.attachments = dto.attachments
    }

    if (dto.estimatedTime !== undefined) {
      task.estimatedTime = dto.estimatedTime
    }

    return this.tasksRepository.save(task)
  }

  async remove(id: string): Promise<void> {
    const result = await this.tasksRepository.delete({ id })

    if (!result.affected) {
      throw new NotFoundException('Tarefa não encontrada.')
    }
  }

  async start(id: string): Promise<Task> {
    const task = await this.findOne(id)

    if (task.status === TaskStatus.Completed) {
      throw new BadRequestException(
        'Não é possível iniciar uma tarefa concluída.',
      )
    }

    if (!task.startedAt) {
      task.startedAt = new Date()
    }

    task.status = TaskStatus.InProgress

    return this.tasksRepository.save(task)
  }

  async complete(id: string, dto: CompleteTaskDto): Promise<TaskCompletion> {
    const task = await this.findOne(id)

    if (task.status === TaskStatus.Completed) {
      throw new BadRequestException('Esta tarefa já foi concluída.')
    }

    const actualTime = this.resolveActualTime(task, dto.actualTime)

    task.actualTime = actualTime
    task.status = TaskStatus.Completed

    const saved = await this.tasksRepository.save(task)

    return {
      task: saved,
      productivityAdvice: this.productivityAdvisor.advise(
        saved.estimatedTime,
        actualTime,
      ),
    }
  }

  private resolveActualTime(task: Task, actualTime?: number): number {
    if (actualTime !== undefined) {
      return actualTime
    }

    if (!task.startedAt) {
      throw new BadRequestException(
        'Informe o tempo real em minutos ou inicie a tarefa antes de concluir.',
      )
    }

    const elapsedMinutes = Math.round(
      (Date.now() - task.startedAt.getTime()) / 60000,
    )

    return Math.max(0, elapsedMinutes)
  }
}

function emptyToNull(value?: string): string | null {
  const trimmed = value?.trim() ?? ''

  return trimmed.length > 0 ? trimmed : null
}
