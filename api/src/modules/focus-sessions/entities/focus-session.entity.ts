import {
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm'

@Entity('focus_sessions')
export class FocusSession {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 120, default: 'Foco livre' })
  title: string

  @Column({ type: 'timestamptz' })
  startedAt: Date

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}
