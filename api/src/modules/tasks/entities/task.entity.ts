import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

import { TaskColor } from '../task-color.enum'
import { TaskPriority } from '../task-priority.enum'
import { TaskStatus } from '../task-status.enum'

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 120 })
  title: string

  @Column({ type: 'text', nullable: true })
  description: string | null

  @Column({ type: 'varchar', length: 40 })
  category: string

  @Column({ type: 'varchar', length: 20, default: TaskPriority.Medium })
  priority: TaskPriority

  @Column({ type: 'varchar', length: 20 })
  color: TaskColor

  @Column({ type: 'timestamptz', nullable: true })
  dueDate: Date | null

  @Column({ type: 'varchar', length: 200, nullable: true })
  location: string | null

  @Column({ type: 'jsonb', default: () => "'[]'" })
  attachments: string[]

  @Column({ type: 'int' })
  estimatedTime: number

  @Column({ type: 'int', nullable: true })
  actualTime: number | null

  @Column({ type: 'varchar', length: 20, default: TaskStatus.Pending })
  status: TaskStatus

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
