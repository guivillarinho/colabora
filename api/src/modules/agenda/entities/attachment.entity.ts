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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}
