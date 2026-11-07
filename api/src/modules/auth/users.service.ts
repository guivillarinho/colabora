import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  User,
  type Person,
  type AccountPreferences,
} from './entities/user.entity'
import { presentAvatar, type PublicAvatar } from './avatar'
import { PreferencesDto } from './dto/preferences.dto'
import { RateLimitService } from './rate-limit.service'

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly limits: RateLimitService,
  ) {}

  async search(
    query: string,
    actor: string,
  ): Promise<Array<Person & { avatar: PublicAvatar | null }>> {
    const term = query.trim().toLowerCase()
    if (term.length < 3 || term.length > 254)
      throw new BadRequestException('Digite de 3 a 254 caracteres para buscar.')
    await this.limits.consume('user-search', actor, 30, 60)
    const results = await this.users
      .createQueryBuilder('user')
      .select(['user.id', 'user.name', 'user.avatarKey'])
      .where('user.name ILIKE :prefix OR user.email = :email', {
        prefix: term.replace(/[\\%_]/g, '\\$&') + '%',
        email: term,
      })
      .orderBy('user.name', 'ASC')
      .take(10)
      .getMany()
    return results.map((user) => ({
      id: user.id,
      name: user.name,
      avatar: presentAvatar(user.avatarKey),
    }))
  }

  async updatePreferences(
    actor: string,
    dto: PreferencesDto,
  ): Promise<AccountPreferences> {
    const patch = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    )
    const [rows]: [Array<{ preferences: AccountPreferences }>, number] =
      await this.users.query(
        'UPDATE users SET preferences = preferences || $1::jsonb WHERE id = $2 RETURNING preferences',
        [JSON.stringify(patch), actor],
      )
    return rows[0].preferences
  }

  async validateAssignee(id: string | null | undefined): Promise<void> {
    if (id && !(await this.users.existsBy({ id })))
      throw new BadRequestException('Responsável inválido.')
  }
}
