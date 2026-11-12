import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'

import { TaskColor } from '../task-color.enum'
import { TaskPriority } from '../task-priority.enum'
import { TaskStatus } from '../task-status.enum'
import { User } from '../../auth/entities/user.entity'

export type ActualTimeSource = 'timer' | 'schedule' | 'estimate' | 'manual'

@Entity('tasks')
export class Task {
  @Column({ type: 'uuid', nullable: true })
  createdById: string | null

  @Column({ type: 'varchar', length: 16, default: 'accepted' })
  assignmentStatus: 'pending' | 'accepted' | 'declined'

  @Column({ type: 'uuid', nullable: true })
  assignedToId: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: User | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedToId' })
  assignedTo?: User | null

  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 120 })
  title: string

  @Column({ type: 'text', nullable: true })
  description: string | null

  @Column({ type: 'varchar', length: 40 })
  category: string

  @Column({ type: 'uuid', nullable: true })
  categoryId: string | null

  @Column({ type: 'varchar', length: 20, default: TaskPriority.Medium })
  priority: TaskPriority

  @Column({ type: 'varchar', length: 20 })
  color: TaskColor

  @Column({ type: 'timestamptz', nullable: true })
  dueDate: Date | null

  @Column({ type: 'jsonb', nullable: true })
  reminderOffsets: number[] | null

  @Column({ type: 'varchar', length: 200, nullable: true })
  location: string | null

  @Column({ type: 'jsonb', default: () => "'[]'" })
  attachments: string[]

  @Column({ type: 'int' })
  estimatedTime: number

  @Column({ type: 'int', nullable: true })
  actualTime: number | null

  @Column({ type: 'varchar', length: 16, nullable: true })
  actualTimeSource: ActualTimeSource | null

  @Column({ type: 'varchar', length: 20, default: TaskStatus.Pending })
  status: TaskStatus

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null

  @Column({ type: 'boolean', default: false })
  timed: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
