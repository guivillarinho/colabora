import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, QueryFailedError, Repository } from 'typeorm'
import * as argon2 from 'argon2'
import { createHash, randomBytes } from 'node:crypto'

import { presentAvatar } from './avatar'
import { User, type Identity } from './entities/user.entity'
import {
  PasswordResetDto,
  PasswordResetRequestDto,
  RegisterDto,
  LoginDto,
} from './dto/auth.dto'
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

  async requestPasswordReset(
    dto: PasswordResetRequestDto,
    ip: string,
  ): Promise<void> {
    await this.limits.consume('password-reset-ip', ip, 20, 3600)
    await this.limits.consume('password-reset-email', dto.email, 5, 3600)

    const apiKey = this.config.get<string>('BREVO_API_KEY')
    const senderEmail = this.config.get<string>('PASSWORD_RESET_FROM_EMAIL')
    const senderName = this.config.get<string>(
      'PASSWORD_RESET_FROM_NAME',
      'Colabora',
    )
    if (!apiKey || !senderEmail)
      throw new ServiceUnavailableException(
        'A recuperação por e-mail ainda não está configurada.',
      )

    const appUrl = new URL(
      this.config.get<string>(
        'PUBLIC_APP_URL',
        'https://colabora-rouge.vercel.app',
      ),
    )
    if (
      appUrl.protocol !== 'https:' &&
      !(
        process.env.NODE_ENV !== 'production' && appUrl.hostname === 'localhost'
      )
    )
      throw new ServiceUnavailableException(
        'A URL segura para recuperação não está configurada.',
      )

    const user = await this.users.findOneBy({ email: dto.email })
    if (!user) return

    const token = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
    await this.source.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM password_reset_tokens WHERE "userId" = $1 AND ("expiresAt" <= now() OR "usedAt" IS NOT NULL)`,
        [user.id],
      )
      await manager.query(
        `UPDATE password_reset_tokens SET "usedAt" = now() WHERE "userId" = $1 AND "usedAt" IS NULL`,
        [user.id],
      )
      await manager.query(
        `INSERT INTO password_reset_tokens ("userId", "tokenHash", "expiresAt") VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt],
      )
    })

    const resetUrl = new URL('/redefinir-senha', appUrl)
    resetUrl.hash = new URLSearchParams({ token }).toString()

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: user.email }],
          subject: 'Redefina sua senha do Colabora',
          htmlContent: `<p>Recebemos um pedido para redefinir sua senha do Colabora.</p><p><a href="${resetUrl.toString()}">Criar uma nova senha</a></p><p>O link expira em 30 minutos e só pode ser usado uma vez. Se você não pediu essa alteração, ignore este e-mail.</p>`,
          textContent: `Acesse ${resetUrl.toString()} para criar uma nova senha. O link expira em 30 minutos e só pode ser usado uma vez. Se você não pediu essa alteração, ignore este e-mail.`,
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok)
        console.error(
          `Falha no provedor de e-mail para recuperação (HTTP ${response.status}).`,
        )
    } catch {
      console.error(
        'Falha de conexão com o provedor de e-mail para recuperação.',
      )
    }
  }

  async resetPassword(dto: PasswordResetDto, ip: string): Promise<void> {
    await this.limits.consume('password-reset-complete-ip', ip, 20, 3600)
    const tokenHash = createHash('sha256').update(dto.token).digest('hex')
    const passwordHash = await argon2.hash(dto.password, hashing)

    await this.source.transaction(async (manager) => {
      const tokens: Array<{ userId: string }> = await manager.query(
        `UPDATE password_reset_tokens SET "usedAt" = now() WHERE "tokenHash" = $1 AND "usedAt" IS NULL AND "expiresAt" > now() RETURNING "userId"`,
        [tokenHash],
      )
      const userId = tokens[0]?.userId
      if (!userId)
        throw new BadRequestException(
          'Este link expirou ou já foi utilizado. Solicite outro.',
        )

      await manager.query(
        `UPDATE users SET "passwordHash" = $1 WHERE id = $2`,
        [passwordHash, userId],
      )
      await manager.query(
        `DELETE FROM app_sessions WHERE sess #>> '{passport,user}' = $1`,
        [userId],
      )
      await manager.query(
        `DELETE FROM password_reset_tokens WHERE "userId" = $1`,
        [userId],
      )
    })
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
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: presentAvatar(user.avatarKey),
      preferences: user.preferences ?? { theme: 'system', palette: 'purple' },
    }
  }
}
