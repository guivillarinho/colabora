import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
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
import { validateReminderTimes } from '../notifications/reminder-options'
import {
  NotificationsService,
  taskReminderOffsets,
} from '../notifications/notifications.service'
import { GoogleSyncOrchestrator } from '../google/google-sync.orchestrator'
import { TaskCategoriesService } from './task-categories.service'

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
    private readonly taskCategories: TaskCategoriesService,
    @Optional()
    @Inject(forwardRef(() => GoogleSyncOrchestrator))
    private readonly googleSync?: GoogleSyncOrchestrator,
  ) {}

  private async mirror(
    ownerId: string | null,
    operation: string,
    payload: Record<string, string>,
  ) {
    if (!ownerId || !this.googleSync) return
    try {
      await this.googleSync.enqueue(ownerId, operation, payload)
    } catch {
      // A gravação local já foi confirmada. A fila tenta de novo.
    }
  }

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

  private async visible(
    id: string,
    actor: string,
    repository = this.tasksRepository,
  ): Promise<Task> {
    const task = await repository.findOne({
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
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null
    validateReminderTimes(dueDate, dto.reminderOffsets)
    const resolved = await this.taskCategories.resolveForTask(
      actor,
      dto.categoryId,
      dto.category,
      dto.color,
    )
    const entity = this.tasksRepository.create({
      ...(id ? { id } : {}),
      title: dto.title.trim(),
      description: emptyToNull(dto.description),
      category: resolved.name,
      categoryId: resolved.categoryId,
      priority: dto.priority ?? TaskPriority.Medium,
      color: resolved.color,
      dueDate,
      reminderOffsets: dto.reminderOffsets ?? null,
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
    const task = await this.tasksRepository.manager.transaction(
      async (manager) => {
        const repository = manager.getRepository(Task)
        if (id) await repository.insert(entity)
        const saved = id ? entity : await repository.save(entity)
        await this.notifications.scheduleTaskReminders(saved, manager)
        return saved
      },
    )
    await this.notifications.notifyUsers(
      [task.createdById, task.assignedToId],
      'Nova tarefa no Colabora',
      task.title,
    )
    if (!dto.syncOptOut)
      await this.mirror(task.createdById, 'push-task', { taskId: task.id })
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
    let categoryChanged = false
    if (dto.categoryId !== undefined || dto.category !== undefined) {
      const resolved = await this.taskCategories.resolveForTask(
        actor,
        dto.categoryId,
        dto.category ?? task.category,
        dto.color ?? task.color,
      )
      changes.category = resolved.name
      changes.categoryId = resolved.categoryId
      changes.color = resolved.color
      categoryChanged = resolved.categoryId !== task.categoryId
    } else if (dto.color !== undefined) {
      changes.color = dto.color
    }
    if (dto.priority !== undefined) changes.priority = dto.priority
    if (dto.dueDate !== undefined)
      changes.dueDate = dto.dueDate ? new Date(dto.dueDate) : null
    if (dto.reminderOffsets !== undefined) {
      validateReminderTimes(
        changes.dueDate === undefined ? task.dueDate : changes.dueDate,
        dto.reminderOffsets,
        task.dueDate,
        taskReminderOffsets(task),
      )
      changes.reminderOffsets = dto.reminderOffsets
    }
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
      const updated = await this.tasksRepository.manager.transaction(
        async (manager) => {
          const repository = manager.getRepository(Task)
          await repository.update({ id, createdById: actor }, changes)
          const saved = await this.visible(id, actor, repository)
          await this.notifications.scheduleTaskReminders(saved, manager)
          return saved
        },
      )
      await this.notifications.notifyUsers(
        [actor, updated.assignedToId],
        'Tarefa atualizada no Colabora',
        updated.title,
      )
    }
    if (!dto.syncOptOut) {
      if (categoryChanged)
        await this.mirror(actor, 'move-task-list', { taskId: id })
      else await this.mirror(actor, 'push-task', { taskId: id })
    }
    return this.findOne(id, actor)
  }

  async remove(id: string, actor: string): Promise<void> {
    const task = await this.visible(id, actor)
    if (task.createdById !== actor)
      throw new ForbiddenException('Somente o criador pode excluir a tarefa.')
    await this.mirror(task.createdById, 'delete-task', {
      entityType: 'task',
      entityId: id,
    })
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
    await this.tasksRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(Task)
      const result = await repository.update(
        { id, assignedToId: actor, assignmentStatus: 'pending' },
        { assignmentStatus: response },
      )
      if (!result.affected)
        throw new BadRequestException(
          'Esta solicitação já foi respondida ou alterada.',
        )
      await this.notifications.scheduleTaskReminders(
        await this.visible(id, actor, repository),
        manager,
      )
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
    await this.mirror(task.createdById, 'push-task', { taskId: id })
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
    const updated = await this.tasksRepository.manager.transaction(
      async (manager) => {
        const repository = manager.getRepository(Task)
        const result = await repository.update(
          this.visibility(actor, id),
          changes,
        )
        if (!result.affected)
          throw new NotFoundException('Tarefa não encontrada.')
        const saved = await this.visible(id, actor, repository)
        if (reopening)
          await this.notifications.scheduleTaskReminders(saved, manager)
        return this.view(saved, actor)
      },
    )
    await this.notifications.notifyUsers(
      [task.createdById, task.assignedToId],
      'Tarefa voltou para pendente',
      task.title,
    )
    await this.mirror(task.createdById, 'push-task', { taskId: id })
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
    await this.notifications.notifyUsers(
      [task.createdById, task.assignedToId],
      'Tarefa concluída no Colabora',
      task.title,
    )
    const saved = await this.findOne(id, actor)
    await this.mirror(task.createdById, 'push-task', { taskId: id })
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
