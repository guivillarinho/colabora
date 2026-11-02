import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac } from 'node:crypto'
import { DataSource } from 'typeorm'

@Injectable()
export class RateLimitService {
  constructor(
    private readonly source: DataSource,
    private readonly config: ConfigService,
  ) {}

  async consume(
    scope: string,
    value: string,
    limit: number,
    seconds = 900,
  ): Promise<void> {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1000 ||
      !Number.isInteger(seconds) ||
      seconds < 1 ||
      seconds > 86400
    )
      throw new Error('Configuração inválida de limitação de tentativas.')
    const key = createHmac(
      'sha256',
      this.config.getOrThrow<string>('SESSION_SECRET'),
    )
      .update(`${scope}:${value}`)
      .digest('hex')
    const rows: Array<{ hits: number }> = await this.source.query(
      `
      WITH expired_limits AS (
        DELETE FROM auth_rate_limits WHERE key IN (
          SELECT key FROM auth_rate_limits WHERE "resetAt" <= now() AND key <> $1 LIMIT 100
        )
      ), expired_sessions AS (
        DELETE FROM app_sessions WHERE sid IN (
          SELECT sid FROM app_sessions WHERE expire <= now() LIMIT 100
        )
      ), expired_revocations AS (
        DELETE FROM revoked_sessions WHERE id IN (
          SELECT id FROM revoked_sessions WHERE "expiresAt" <= now() LIMIT 100
        )
      )
      INSERT INTO auth_rate_limits (key, hits, "resetAt") VALUES ($1, 1, now() + $2 * interval '1 second')
      ON CONFLICT (key) DO UPDATE SET hits = CASE WHEN auth_rate_limits."resetAt" <= now() THEN 1 ELSE auth_rate_limits.hits + 1 END,
      "resetAt" = CASE WHEN auth_rate_limits."resetAt" <= now() THEN now() + $2 * interval '1 second' ELSE auth_rate_limits."resetAt" END RETURNING hits
    `,
      [key, seconds],
    )
    if (Number(rows[0].hits) > limit) {
      throw new HttpException(
        'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }
}
