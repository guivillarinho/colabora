import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, IsNull, Repository } from 'typeorm'

import { googlePreferences } from '../google/google-preferences'
import { CreateTaskCategoryDto } from './dto/create-task-category.dto'
import { UpdateTaskCategoryDto } from './dto/update-task-category.dto'
import { Task } from './entities/task.entity'
import { TaskCategory } from './entities/task-category.entity'
import { defaultTaskCategorySeed } from './task-category-defaults'
import { TaskColor } from './task-color.enum'

@Injectable()
export class TaskCategoriesService {
  constructor(
    private readonly source: DataSource,
    @InjectRepository(TaskCategory)
    private readonly categories: Repository<TaskCategory>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    private readonly modules: ModuleRef,
  ) {}

  async list(actor: string): Promise<TaskCategory[]> {
    await this.ensureCatalog(actor)
    return this.categories.find({
      where: { ownerId: actor, deletedAt: IsNull() },
      order: { name: 'ASC' },
    })
  }

  async ensureCatalog(ownerId: string): Promise<void> {
    const existing = await this.categories.count({
      where: { ownerId, deletedAt: IsNull() },
    })
    if (existing === 0) {
      await this.source.query(
        `INSERT INTO task_categories (id,"ownerId",name,color,"syncState")
         SELECT gen_random_uuid(), $1, seed.name, seed.color, 'pending'
         FROM jsonb_to_recordset($2::jsonb) AS seed(name text, color text)
         ON CONFLICT ("ownerId", name) DO NOTHING`,
        [ownerId, JSON.stringify(defaultTaskCategorySeed)],
      )
    }
    await this.backfillTaskCategoryIds(ownerId)
    await this.migrateLegacyMap(ownerId).catch(() => undefined)
  }

  async findOwned(id: string, ownerId: string): Promise<TaskCategory> {
    const row = await this.categories.findOne({
      where: { id, ownerId, deletedAt: IsNull() },
    })
    if (!row) throw new NotFoundException('Categoria não encontrada.')
    return row
  }

  async resolveForTask(
    ownerId: string,
    categoryId?: string | null,
    categoryName?: string,
    color?: TaskColor,
  ): Promise<{ categoryId: string; name: string; color: TaskColor }> {
    await this.ensureCatalog(ownerId)
    if (categoryId) {
      const row = await this.findOwned(categoryId, ownerId)
      return { categoryId: row.id, name: row.name, color: row.color }
    }
    const trimmed = (categoryName ?? '').trim()
    if (!trimmed) throw new BadRequestException('Informe a categoria.')
    const match = await this.categories
      .createQueryBuilder('c')
      .where('c.ownerId = :ownerId', { ownerId })
      .andWhere('c.deletedAt IS NULL')
      .andWhere('LOWER(c.name) = LOWER(:name)', { name: trimmed })
      .getOne()
    if (match)
      return { categoryId: match.id, name: match.name, color: match.color }
    const created = await this.create(
      { name: trimmed, color: color ?? TaskColor.Blue },
      ownerId,
    )
    return { categoryId: created.id, name: created.name, color: created.color }
  }

  async create(
    dto: CreateTaskCategoryDto,
    ownerId: string,
  ): Promise<TaskCategory> {
    await this.ensureCatalog(ownerId)
    const name = dto.name.trim()
    const duplicate = await this.categories
      .createQueryBuilder('c')
      .where('c.ownerId = :ownerId', { ownerId })
      .andWhere('c.deletedAt IS NULL')
      .andWhere('LOWER(c.name) = LOWER(:name)', { name })
      .getOne()
    if (duplicate)
      throw new ConflictException('Já existe uma categoria com esse nome.')
    try {
      const saved = await this.categories.save(
        this.categories.create({
          ownerId,
          name,
          color: dto.color,
          syncState: 'pending',
        }),
      )
      await this.enqueue(ownerId, 'push-category-list', {
        categoryId: saved.id,
      })
      return saved
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      const existing = await this.categories
        .createQueryBuilder('c')
        .where('c.ownerId = :ownerId', { ownerId })
        .andWhere('c.deletedAt IS NULL')
        .andWhere('LOWER(c.name) = LOWER(:name)', { name })
        .getOne()
      if (existing) return existing
      throw error
    }
  }

  async update(
    id: string,
    dto: UpdateTaskCategoryDto,
    ownerId: string,
  ): Promise<TaskCategory> {
    const row = await this.findOwned(id, ownerId)
    if (dto.name !== undefined) {
      const name = dto.name.trim()
      const duplicate = await this.categories
        .createQueryBuilder('c')
        .where('c.ownerId = :ownerId', { ownerId })
        .andWhere('c.deletedAt IS NULL')
        .andWhere('LOWER(c.name) = LOWER(:name)', { name })
        .andWhere('c.id <> :id', { id })
        .getOne()
      if (duplicate)
        throw new ConflictException('Já existe uma categoria com esse nome.')
      row.name = name
    }
    if (dto.color !== undefined) row.color = dto.color
    const saved = await this.categories.save(row)
    await this.enqueue(ownerId, 'update-category-list', {
      categoryId: saved.id,
    })
    const tasks = await this.tasks.find({
      where: { createdById: ownerId, categoryId: saved.id },
    })
    for (const task of tasks) {
      await this.tasks.update(
        { id: task.id },
        { category: saved.name, color: saved.color },
      )
    }
    return saved
  }

  async remove(
    id: string,
    ownerId: string,
    reassignToId?: string,
  ): Promise<void> {
    const row = await this.findOwned(id, ownerId)
    const count = await this.tasks.count({
      where: { createdById: ownerId, categoryId: id },
    })
    if (count > 0) {
      if (!reassignToId)
        throw new BadRequestException(
          'Há tarefas nesta categoria. Informe outra categoria para reatribuir ou mova as tarefas antes de excluir.',
        )
      const target = await this.findOwned(reassignToId, ownerId)
      await this.tasks.update(
        { createdById: ownerId, categoryId: id },
        {
          categoryId: target.id,
          category: target.name,
          color: target.color,
        },
      )
    }
    row.deletedAt = new Date()
    row.syncState = 'pending'
    await this.categories.save(row)
    await this.enqueue(ownerId, 'delete-category-list', { categoryId: id })
  }

  private async backfillTaskCategoryIds(ownerId: string): Promise<void> {
    const orphanTasks = await this.tasks
      .createQueryBuilder('t')
      .where('t.createdById = :ownerId', { ownerId })
      .andWhere('t.categoryId IS NULL')
      .getMany()
    for (const task of orphanTasks) {
      const match = await this.categories
        .createQueryBuilder('c')
        .where('c.ownerId = :ownerId', { ownerId })
        .andWhere('c.deletedAt IS NULL')
        .andWhere('LOWER(c.name) = LOWER(:name)', {
          name: task.category.trim(),
        })
        .getOne()
      if (match) {
        await this.tasks.update(
          { id: task.id },
          { categoryId: match.id, color: match.color },
        )
      }
    }
  }

  private async migrateLegacyMap(ownerId: string): Promise<void> {
    const rows = await this.source.query(
      'SELECT preferences FROM google_connections WHERE "ownerId"=$1 AND status=$2',
      [ownerId, 'connected'],
    )
    if (!rows[0]) return
    const prefs = googlePreferences(rows[0].preferences)
    if (!prefs.categoryTaskListMap) return
    for (const [name, listId] of Object.entries(prefs.categoryTaskListMap)) {
      if (!listId) continue
      const category = await this.categories
        .createQueryBuilder('c')
        .where('c.ownerId = :ownerId', { ownerId })
        .andWhere('c.deletedAt IS NULL')
        .andWhere('LOWER(c.name) = LOWER(:name)', { name: name.trim() })
        .getOne()
      if (category && !category.googleListId) {
        category.googleListId = listId
        category.syncState = 'synced'
        await this.categories.save(category)
      }
    }
  }

  private async enqueue(
    ownerId: string,
    operation: string,
    payload: Record<string, string>,
  ) {
    try {
      const { GoogleSyncOrchestrator } = await import(
        '../google/google-sync.orchestrator.js'
      )
      const googleSync = this.modules.get(GoogleSyncOrchestrator, {
        strict: false,
      })
      if (!googleSync) return
      await googleSync.enqueue(ownerId, operation, payload)
    } catch {
      // A gravação local já foi confirmada.
    }
  }
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}
