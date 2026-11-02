import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, QueryFailedError, Repository } from 'typeorm'
import * as argon2 from 'argon2'
import { createHash, randomBytes } from 'node:crypto'

import { User, type Identity } from './entities/user.entity'
import { RegisterDto, LoginDto } from './dto/auth.dto'
import { RateLimitService } from './rate-limit.service'
import { sessionSettings } from './session-settings'

const hashing = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

@Injectable()
export class AuthService {
  private readonly dummyHash = argon2.hash(
    randomBytes(32).toString('hex'),
    hashing,
  )

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly limits: RateLimitService,
    private readonly config: ConfigService,
    private readonly source: DataSource,
  ) {}

  async register(dto: RegisterDto, ip: string): Promise<Identity> {
    await this.limits.consume(
      'register-ip',
      ip,
      Number(this.config.get('AUTH_REGISTER_LIMIT', '10')),
    )
    const passwordHash = await argon2.hash(dto.password, hashing)
    try {
      const user = await this.users.save(
        this.users.create({ name: dto.name, email: dto.email, passwordHash }),
      )
      return this.identity(user)
    } catch (cause) {
      if (
        cause instanceof QueryFailedError &&
        (cause.driverError as { code?: string }).code === '23505'
      ) {
        throw new BadRequestException(
          'Não foi possível criar a conta com esses dados. Tente entrar ou use outro endereço.',
        )
      }
      throw cause
    }
  }

  async login(dto: LoginDto, ip: string): Promise<Identity> {
    await this.limits.consume(
      'login-ip',
      ip,
      Number(this.config.get('AUTH_IP_LIMIT', '30')),
    )
    await this.limits.consume(
      'login-email',
      dto.email,
      Number(this.config.get('AUTH_LOGIN_LIMIT', '10')),
    )
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: dto.email })
      .getOne()
    const valid = await argon2.verify(
      user?.passwordHash ?? (await this.dummyHash),
      dto.password,
    )
    if (!user || !valid)
      throw new UnauthorizedException('E-mail ou senha inválidos.')
    if (argon2.needsRehash(user.passwordHash, hashing)) {
      await this.users.update(
        { id: user.id },
        { passwordHash: await argon2.hash(dto.password, hashing) },
      )
    }
    return this.identity(user)
  }

  async findIdentity(id: string): Promise<Identity | null> {
    const user = await this.users.findOneBy({ id })
    return user ? this.identity(user) : null
  }

  async revokeSession(sid: string): Promise<void> {
    const expires = new Date(
      Date.now() + sessionSettings(this.config).absoluteMs,
    )
    await this.source.query(
      'INSERT INTO revoked_sessions (id, "expiresAt") VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
      [createHash('sha256').update(sid).digest('hex'), expires],
    )
  }

  async isRevoked(sid: string): Promise<boolean> {
    const rows: unknown[] = await this.source.query(
      'SELECT id FROM revoked_sessions WHERE id = $1 AND "expiresAt" > now()',
      [createHash('sha256').update(sid).digest('hex')],
    )
    return rows.length > 0
  }

  private identity(user: User): Identity {
    return { id: user.id, name: user.name, email: user.email }
  }
}
