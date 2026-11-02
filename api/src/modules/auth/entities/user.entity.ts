import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm'

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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}

export type Identity = Pick<User, 'id' | 'name' | 'email'>
export type Person = Pick<User, 'id' | 'name'>
export function person(user: User | null | undefined): Person | null {
  return user ? { id: user.id, name: user.name } : null
}
