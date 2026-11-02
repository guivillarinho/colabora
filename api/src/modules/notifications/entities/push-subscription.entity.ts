import {
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm'

@Entity('push_subscriptions')
@Index('push_subscriptions_endpoint_unique', ['endpoint'], { unique: true })
@Index('push_subscriptions_user', ['userId'])
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid' })
  userId: string

  @Column({ type: 'text' })
  endpoint: string

  @Column({ type: 'varchar', length: 200 })
  p256dh: string

  @Column({ type: 'varchar', length: 100 })
  auth: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}
