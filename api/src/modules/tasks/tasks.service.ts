import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsWhere, Repository } from 'typeorm'

import { CompleteTaskDto } from './dto/complete-task.dto'
import { CreateTaskDto } from './dto/create-task.dto'
import { UpdateTaskDto } from './dto/update-task.dto'
import { Task } from './entities/task.entity'
import { resolveExecution } from './execution-time'
import { ProductivityAdvisorService } from './productivity-advisor.service'
import { TaskPriority } from './task-priority.enum'
import { TaskStatus } from './task-status.enum'
import { UsersService } from '../auth/users.service'
import { person } from '../auth/entities/user.entity'
import { presentAvatar, type PublicAvatar } from '../auth/avatar'
import { AttachmentsService } from '../agenda/attachments.service'
import { NotificationsService } from '../notifications/notifications.service'

export type TaskView = Omit<Task, 'createdBy' | 'assignedTo'> & {
  createdBy: ReturnType<typeof person>
  assignedTo:
    | (NonNullable<ReturnType<typeof person>> & { avatar: PublicAvatar | null })
    | null
  permissions: {
    edit: boolean
    assign: boolean
    delete: boolean
    changeStatus: boolean
  }
}
export type TaskCompletion = {
  task: TaskView
  productivityAdvice: string | null
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task) private readonly tasksRepository: Repository<Task>,
    private readonly productivityAdvisor: ProductivityAdvisorService,
    private readonly users: UsersService,
    private readonly attachments: AttachmentsService,
    private readonly notifications: NotificationsService,
  ) {}

  private visibility(actor: string, id?: string): FindOptionsWhere<Task>[] {
    return [
      { ...(id ? { id } : {}), createdById: actor },
      { ...(id ? { id } : {}), assignedToId: actor },
    ]
  }

  private view(task: Task, actor: string): TaskView {
    const owner = task.createdById === actor
    return {
      ...task,
      createdBy: person(task.createdBy),
      assignedTo: task.assignedTo
        ? {
            ...person(task.assignedTo)!,
            avatar: presentAvatar(task.assignedTo.avatarKey),
          }
        : null,
      permissions: {
        edit: owner,
        assign: owner,
        delete: owner,
        changeStatus:
          task.assignmentStatus !== 'pending' &&
          (owner || task.assignmentStatus !== 'declined'),
      },
    }
  }

  private async visible(id: string, actor: string): Promise<Task> {
    const task = await this.tasksRepository.findOne({
      where: this.visibility(actor, id),
      relations: { createdBy: true, assignedTo: true },
    })
    if (!task) throw new NotFoundException('Tarefa não encontrada.')
    return task
  }

  async create(
    dto: CreateTaskDto,
    actor: string,
    id?: string,
  ): Promise<TaskView> {
    await this.users.validateAssignee(dto.assignedToId)
    await this.attachments.assertOwnReferences(dto.attachments ?? [], actor)
    const assignedToId =
      dto.assignedToId === undefined ? actor : dto.assignedToId
    const pending = !!assignedToId && assignedToId !== actor
    if (pending && dto.startImmediately)
      throw new BadRequestException(
        'O responsável precisa aceitar antes de iniciar.',
      )
    const entity = this.tasksRepository.create({
      ...(id ? { id } : {}),
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
      completedAt: null,
      timed: dto.startImmediately === true,
      createdById: actor,
      assignedToId,
      assignmentStatus: pending ? 'pending' : 'accepted',
    })
    const task = id
      ? (await this.tasksRepository.insert(entity), entity)
      : await this.tasksRepository.save(entity)
    await this.notifications.scheduleTaskReminders(task)
    await this.notifications.notifyUsers(
      [task.createdById, task.assignedToId],
      'Nova tarefa no Colabora',
      task.title,
    )
    return this.findOne(task.id, actor)
  }

  async findAll(actor: string): Promise<TaskView[]> {
    const tasks = await this.tasksRepository.find({
      where: this.visibility(actor),
      relations: { createdBy: true, assignedTo: true },
      order: { createdAt: 'DESC' },
    })
    return tasks.map((task) => this.view(task, actor))
  }

  async findOne(id: string, actor: string): Promise<TaskView> {
    return this.view(await this.visible(id, actor), actor)
  }

  async update(
    id: string,
    dto: UpdateTaskDto,
    actor: string,
  ): Promise<TaskView> {
    const task = await this.visible(id, actor)
    if (task.createdById !== actor)
      throw new ForbiddenException(
        'Somente o criador pode editar ou reatribuir a tarefa.',
      )
    await this.users.validateAssignee(dto.assignedToId)
    if (dto.attachments !== undefined)
      await this.attachments.assertOwnReferences(dto.attachments, actor)
    const changes: Partial<Task> = {}
    if (dto.title !== undefined) changes.title = dto.title.trim()
    if (dto.description !== undefined)
      changes.description = emptyToNull(dto.description)
    if (dto.category !== undefined) changes.category = dto.category.trim()
    if (dto.priority !== undefined) changes.priority = dto.priority
    if (dto.color !== undefined) changes.color = dto.color
    if (dto.dueDate !== undefined)
      changes.dueDate = dto.dueDate ? new Date(dto.dueDate) : null
    if (dto.location !== undefined) changes.location = emptyToNull(dto.location)
    if (dto.attachments !== undefined) changes.attachments = dto.attachments
    if (dto.estimatedTime !== undefined)
      changes.estimatedTime = dto.estimatedTime
    if (
      dto.assignedToId !== undefined &&
      dto.assignedToId !== task.assignedToId
    ) {
      if (task.status !== TaskStatus.Pending)
        throw new BadRequestException(
          'Reabra a tarefa antes de mudar o responsável.',
        )
      changes.assignedToId = dto.assignedToId
      changes.assignmentStatus =
        dto.assignedToId && dto.assignedToId !== actor ? 'pending' : 'accepted'
    }
    if (Object.keys(changes).length) {
      await this.tasksRepository.update({ id, createdById: actor }, changes)
      const updated = await this.visible(id, actor)
      await this.notifications.scheduleTaskReminders({ ...task, ...changes })
      await this.notifications.notifyUsers(
        [actor, updated.assignedToId],
        'Tarefa atualizada no Colabora',
        updated.title,
      )
    }
    return this.findOne(id, actor)
  }

  async remove(id: string, actor: string): Promise<void> {
    const task = await this.visible(id, actor)
    if (task.createdById !== actor)
      throw new ForbiddenException('Somente o criador pode excluir a tarefa.')
    const result = await this.tasksRepository.delete({ id, createdById: actor })
    if (!result.affected) throw new NotFoundException('Tarefa não encontrada.')
    await this.notifications.notifyUsers(
      [task.createdById, task.assignedToId],
      'Tarefa removida do Colabora',
      task.title,
    )
  }

  private assertCanAct(task: Task, actor: string) {
    if (!this.view(task, actor).permissions.changeStatus)
      throw new ForbiddenException(
        'O responsável precisa aceitar a tarefa antes de executá-la.',
      )
  }

  async respondAssignment(
    id: string,
    actor: string,
    response: 'accepted' | 'declined',
  ): Promise<TaskView> {
    const task = await this.visible(id, actor)
    if (task.assignedToId !== actor || task.createdById === actor)
      throw new ForbiddenException(
        'Somente o responsável convidado pode responder.',
      )
    const result = await this.tasksRepository.update(
      { id, assignedToId: actor, assignmentStatus: 'pending' },
      { assignmentStatus: response },
    )
    if (!result.affected)
      throw new BadRequestException(
        'Esta solicitação já foi respondida ou alterada.',
      )
    await this.notifications.scheduleTaskReminders({
      ...task,
      assignmentStatus: response,
    })
    await this.notifications.notifyUsers(
      [task.createdById],
      response === 'accepted' ? 'Tarefa aceita' : 'Tarefa recusada',
      task.title,
    )
    return this.findOne(id, actor)
  }

  async start(id: string, actor: string): Promise<TaskView> {
    const task = await this.visible(id, actor)
    this.assertCanAct(task, actor)
    if (task.status === TaskStatus.Completed)
      throw new BadRequestException(
        'Não é possível iniciar uma tarefa concluída.',
      )
    const result = await this.tasksRepository.update(
      this.visibility(actor, id),
      {
        status: TaskStatus.InProgress,
        startedAt: task.startedAt ?? new Date(),
      },
    )
    if (!result.affected) throw new NotFoundException('Tarefa não encontrada.')
    const updated = await this.findOne(id, actor)
    await this.notifications.notifyUsers(
      [task.createdById, task.assignedToId],
      'Tarefa iniciada no Colabora',
      task.title,
    )
    return updated
  }

  async setPending(id: string, actor: string): Promise<TaskView> {
    const task = await this.visible(id, actor)
    this.assertCanAct(task, actor)
    const reopening = task.status === TaskStatus.Completed
    const changes: Partial<Task> = {
      status: TaskStatus.Pending,
      ...(reopening
        ? {
            startedAt: null,
            actualTime: null,
            actualTimeSource: null,
            completedAt: null,
          }
        : {}),
    }
    const result = await this.tasksRepository.update(
      this.visibility(actor, id),
      changes,
    )
    if (!result.affected) throw new NotFoundException('Tarefa não encontrada.')
    const updated = await this.findOne(id, actor)
    if (reopening)
      await this.notifications.scheduleTaskReminders({ ...task, ...changes })
    await this.notifications.notifyUsers(
      [task.createdById, task.assignedToId],
      'Tarefa voltou para pendente',
      task.title,
    )
    return updated
  }

  async complete(
    id: string,
    dto: CompleteTaskDto,
    actor: string,
  ): Promise<TaskCompletion> {
    const task = await this.visible(id, actor)
    this.assertCanAct(task, actor)
    if (task.status === TaskStatus.Completed)
      return { task: this.view(task, actor), productivityAdvice: null }
    const completedAt = new Date()
    const { actualTime, actualTimeSource } = resolveExecution(
      task,
      dto.actualTime,
      completedAt,
    )
    const result = await this.tasksRepository.update(
      this.visibility(actor, id),
      {
        actualTime,
        actualTimeSource,
        status: TaskStatus.Completed,
        completedAt,
      },
    )
    if (!result.affected) throw new NotFoundException('Tarefa não encontrada.')
    await this.notifications.scheduleTaskReminders({
      ...task,
      status: TaskStatus.Completed,
    })
    await this.notifications.notifyUsers(
      [task.createdById, task.assignedToId],
      'Tarefa concluída no Colabora',
      task.title,
    )
    const saved = await this.findOne(id, actor)
    return {
      task: saved,
      productivityAdvice:
        actualTimeSource === 'schedule' || actualTimeSource === 'estimate'
          ? null
          : this.productivityAdvisor.advise(saved.estimatedTime, actualTime),
    }
  }
}
function emptyToNull(value?: string): string | null {
  return value?.trim() || null
}
