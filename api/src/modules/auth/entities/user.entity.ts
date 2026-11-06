import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm'
import type { PublicAvatar } from '../avatar'

export type AccountPreferences = {
  theme: 'system' | 'light' | 'dark'
  palette: 'purple' | 'green' | 'blue' | 'yellow' | 'red'
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 80 })
  name: string

  @Column({ type: 'varchar', length: 254, unique: true })
  email: string

  @Column({ type: 'text', select: false })
  passwordHash: string

  @Column({ type: 'varchar', length: 120, nullable: true })
  avatarKey: string | null

  @Column({
    type: 'jsonb',
    default: () => `'{"theme":"system","palette":"purple"}'`,
  })
  preferences: AccountPreferences

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}

export type Identity = Pick<User, 'id' | 'name' | 'email'> & {
  avatar: PublicAvatar | null
  preferences?: AccountPreferences
}
export type Person = Pick<User, 'id' | 'name'>
export function person(user: User | null | undefined): Person | null {
  return user ? { id: user.id, name: user.name } : null
}
