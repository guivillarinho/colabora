import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User, type Person } from './entities/user.entity'
import { RateLimitService } from './rate-limit.service'

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly limits: RateLimitService,
  ) {}

  async search(query: string, actor: string): Promise<Person[]> {
    const term = query.trim().toLowerCase()
    if (term.length < 3 || term.length > 254)
      throw new BadRequestException('Digite de 3 a 254 caracteres para buscar.')
    await this.limits.consume('user-search', actor, 30, 60)
    return this.users
      .createQueryBuilder('user')
      .select(['user.id', 'user.name'])
      .where('user.name ILIKE :prefix OR user.email = :email', {
        prefix: term.replace(/[\\%_]/g, '\\$&') + '%',
        email: term,
      })
      .orderBy('user.name', 'ASC')
      .take(10)
      .getMany()
  }

  async validateAssignee(id: string | null | undefined): Promise<void> {
    if (id && !(await this.users.existsBy({ id })))
      throw new BadRequestException('Responsável inválido.')
  }
}
