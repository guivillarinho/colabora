import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

import { User } from '../../auth/entities/user.entity'
import { TaskColor } from '../task-color.enum'

export type TaskCategorySyncState = 'synced' | 'pending' | 'error' | 'conflict'

@Entity('task_categories')
export class TaskCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid' })
  ownerId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner?: User

  @Column({ type: 'varchar', length: 40 })
  name: string

  @Column({ type: 'varchar', length: 20, default: TaskColor.Blue })
  color: TaskColor

  @Column({ type: 'varchar', length: 128, nullable: true })
  googleListId: string | null

  @Column({ type: 'varchar', length: 128, nullable: true })
  googleEtag: string | null

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  syncState: TaskCategorySyncState

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
