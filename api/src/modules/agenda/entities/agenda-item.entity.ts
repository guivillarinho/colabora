import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export type AgendaItemType = 'event' | 'project'

@Entity('agenda_items')
export class AgendaItem {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 120 })
  title: string

  @Column({ type: 'varchar', length: 20 })
  type: AgendaItemType

  @Column({ type: 'text', nullable: true })
  description: string | null

  @Column({ type: 'timestamptz' })
  startDate: Date

  @Column({ type: 'timestamptz' })
  endDate: Date

  @Column({ type: 'varchar', length: 200, nullable: true })
  location: string | null

  @Column({ type: 'jsonb', default: () => "'[]'" })
  attachments: string[]

  @Column({ type: 'varchar', length: 40, nullable: true })
  icon: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
