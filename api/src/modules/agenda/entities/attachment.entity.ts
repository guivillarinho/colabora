import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm'

@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 80, unique: true })
  filename: string

  @Column({ type: 'uuid' })
  ownerId: string

  @Column({ type: 'varchar', length: 200 })
  storagePath: string

  @Column({ type: 'bytea', nullable: true, select: false })
  content: Buffer | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}
