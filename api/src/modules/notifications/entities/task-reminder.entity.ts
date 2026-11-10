import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export type ReminderKind = 'before' | 'due'
export type ReminderStatus = 'pending' | 'processing' | 'sent'

@Entity('task_reminders')
@Index('task_reminders_dedupe', ['taskId', 'userId', 'kind', 'scheduledAt'], {
  unique: true,
})
@Index(
  'task_reminders_agenda_dedupe',
  ['agendaItemId', 'userId', 'kind', 'scheduledAt'],
  {
    unique: true,
  },
)
@Index('task_reminders_queue', ['status', 'scheduledAt'])
export class TaskReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid', nullable: true })
  taskId: string | null

  @Column({ type: 'uuid', nullable: true })
  agendaItemId: string | null

  @Column({ type: 'uuid' })
  userId: string

  @Column({ type: 'varchar', length: 10 })
  kind: ReminderKind

  @Column({ type: 'timestamptz' })
  scheduledAt: Date

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status: ReminderStatus

  @Column({ type: 'integer', default: 0 })
  attempts: number

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
