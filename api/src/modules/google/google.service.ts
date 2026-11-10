import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DataSource } from 'typeorm'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { TasksService } from '../tasks/tasks.service'
import { RateLimitService } from '../auth/rate-limit.service'
export const calendarScope =
  'https://www.googleapis.com/auth/calendar.events.owned'
export const googleScopes = `openid email ${calendarScope}`
export type OAuthPending = {
  state: string
  verifier: string
  expires: number
  owner: string
}
type Connection = { version: string; token: string; status: string }
@Injectable()
export class GoogleService {
  constructor(
    private readonly config: ConfigService,
    private readonly source: DataSource,
    private readonly tasks: TasksService,
    private readonly limits: RateLimitService,
  ) {}

  configured() {
    return (
      this.config.get('GOOGLE_ENABLED') === 'true' &&
      [
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_REDIRECT_URI',
        'GOOGLE_TOKEN_ENCRYPTION_KEY',
        'PUBLIC_APP_URL',
      ].every((key) => !!this.config.get(key))
    )
  }

  private key() {
    const key = Buffer.from(
      this.config.getOrThrow<string>('GOOGLE_TOKEN_ENCRYPTION_KEY'),
      'base64',
    )
    if (key.length !== 32)
      throw new ServiceUnavailableException('Configuração Google inválida.')
    return key
  }

  encrypt(token: string, owner: string) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv)
    cipher.setAAD(Buffer.from(owner))
    const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
  }

  decrypt(value: string, owner: string) {
    const bytes = Buffer.from(value, 'base64')
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      bytes.subarray(0, 12),
    )
    decipher.setAAD(Buffer.from(owner))
    decipher.setAuthTag(bytes.subarray(12, 28))
    return Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString('utf8')
  }

  private enabled() {
    if (!this.configured())
      throw new ServiceUnavailableException(
        'Integração Google ainda não configurada.',
      )
    this.key()
    this.url('PUBLIC_APP_URL')
    this.url('GOOGLE_REDIRECT_URI')
  }

  private url(key: string) {
    const url = new URL(this.config.getOrThrow<string>(key))
    if (
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(url.hostname))
      )
    )
      throw new ServiceUnavailableException('URL Google inválida.')
    return url.toString()
  }

  async start(actor: string) {
    this.enabled()
    await this.limits.consume('google-connect', actor, 10, 3600)
    const existing = await this.source.query(
      'SELECT status FROM google_connections WHERE "ownerId"=$1',
      [actor],
    )
    if (existing[0] && existing[0].status !== 'reconnect')
      throw new ConflictException(
        'Desconecte a conta atual antes de vincular outra.',
      )
    const pending = {
      state: randomBytes(32).toString('base64url'),
      verifier: randomBytes(48).toString('base64url'),
      expires: Date.now() + 600000,
      owner: actor,
    }
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search = new URLSearchParams({
      client_id: this.config.getOrThrow('GOOGLE_CLIENT_ID'),
      redirect_uri: this.url('GOOGLE_REDIRECT_URI'),
      response_type: 'code',
      scope: googleScopes,
      access_type: 'offline',
      prompt: 'consent select_account',
      state: pending.state,
      code_challenge: createHash('sha256')
        .update(pending.verifier)
        .digest('base64url'),
      code_challenge_method: 'S256',
    }).toString()
    return { pending, url: url.toString() }
  }

  profileUrl(outcome: 'connected' | 'cancelled' | 'error'): string {
    const url = new URL('/perfil', this.url('PUBLIC_APP_URL'))
    url.searchParams.set('google', outcome)
    return url.toString()
  }

  private credentials(
    value: string,
    actor: string,
  ): {
    refreshToken: string
    email?: string
  } {
    const decrypted = this.decrypt(value, actor)
    if (!decrypted.startsWith('{')) return { refreshToken: decrypted }
    const credentials = JSON.parse(decrypted) as {
      refreshToken: string
      email?: string
    }
    if (!credentials.refreshToken)
      throw new ServiceUnavailableException('Reconecte sua conta Google.')
    return credentials
  }

  private async token(params: Record<string, string>) {
    return fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...params,
        client_id: this.config.getOrThrow('GOOGLE_CLIENT_ID'),
        client_secret: this.config.getOrThrow('GOOGLE_CLIENT_SECRET'),
      }),
    })
  }

  async callback(
    actor: string,
    pending: OAuthPending | undefined,
    state: string,
    code: string,
    error?: string,
  ) {
    this.enabled()
    if (
      !pending ||
      pending.owner !== actor ||
      pending.expires < Date.now() ||
      !state ||
      Buffer.byteLength(state) !== Buffer.byteLength(pending.state) ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))
    )
      throw new BadRequestException(
        'Autorização expirada ou inválida. Tente vincular novamente.',
      )
    if (error === 'access_denied') return this.profileUrl('cancelled')
    if (error || !code)
      throw new BadRequestException('Google não autorizou o vínculo.')
    try {
      const response = await this.token({
        grant_type: 'authorization_code',
        code,
        code_verifier: pending.verifier,
        redirect_uri: this.url('GOOGLE_REDIRECT_URI'),
      })
      if (!response.ok) throw new Error('OAuth')
      const value = (await response.json()) as {
        refresh_token?: string
        access_token?: string
        scope?: string
      }
      if (
        !value.refresh_token ||
        !value.access_token ||
        !value.scope?.split(' ').includes(calendarScope)
      )
        throw new Error('Permissão incompleta')
      const identityResponse = await fetch(
        'https://openidconnect.googleapis.com/v1/userinfo',
        {
          headers: { Authorization: `Bearer ${value.access_token}` },
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
        },
      )
      if (!identityResponse.ok) throw new Error('Conta indisponível')
      const identity = (await identityResponse.json()) as {
        email?: string
        email_verified?: boolean
      }
      if (
        typeof identity.email !== 'string' ||
        identity.email.length > 254 ||
        identity.email_verified !== true
      )
        throw new Error('Conta sem e-mail verificado')
      const credentials = JSON.stringify({
        refreshToken: value.refresh_token,
        email: identity.email,
      })
      await this.source.query(
        'INSERT INTO google_connections("ownerId",version,token,status) VALUES ($1,$2,$3,\'connected\') ON CONFLICT ("ownerId") DO UPDATE SET version=EXCLUDED.version,token=EXCLUDED.token,status=\'connected\'',
        [actor, randomUUID(), this.encrypt(credentials, actor)],
      )
      await this.source.query(
        'DELETE FROM google_calendar_sync WHERE "ownerId"=$1',
        [actor],
      )
      return this.profileUrl('connected')
    } catch {
      throw new ServiceUnavailableException(
        'Não foi possível vincular Google. Tente novamente.',
      )
    }
  }

  private async connection(actor: string): Promise<Connection> {
    const rows = await this.source.query(
      'SELECT version,token,status FROM google_connections WHERE "ownerId"=$1',
      [actor],
    )
    if (!rows[0])
      throw new ConflictException('Vincule sua conta Google primeiro.')
    return rows[0]
  }

  async status(actor: string) {
    const rows = await this.source.query(
      'SELECT status,token FROM google_connections WHERE "ownerId"=$1',
      [actor],
    )
    const synced = await this.source.query(
      'SELECT "taskId","syncedAt" FROM google_calendar_sync WHERE "ownerId"=$1',
      [actor],
    )
    return {
      configured: this.configured(),
      email:
        rows[0]?.token && this.config.get('GOOGLE_TOKEN_ENCRYPTION_KEY')
          ? (this.credentials(rows[0].token, actor).email ?? null)
          : null,
      status: rows[0]?.status ?? 'disconnected',
      synced,
    }
  }

  async disconnect(actor: string) {
    this.key()
    await this.limits.consume('google-disconnect', actor, 10, 60)
    const row = await this.connection(actor)
    await this.source.query(
      'UPDATE google_connections SET status=\'disconnecting\' WHERE "ownerId"=$1 AND version=$2',
      [actor, row.version],
    )
    try {
      const response = await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: this.credentials(row.token, actor).refreshToken,
        }),
      })
      if (!response.ok && response.status !== 400) throw new Error('Revogação')
      await this.source.query(
        'DELETE FROM google_connections WHERE "ownerId"=$1 AND version=$2',
        [actor, row.version],
      )
    } catch {
      throw new ServiceUnavailableException(
        'Revogação pendente. Tente desconectar novamente; você também pode revogar o acesso na conta Google.',
      )
    }
  }

  async sync(actor: string, taskId: string) {
    this.enabled()
    await this.limits.consume('google-sync', actor, 20, 60)
    const task = await this.tasks.findOne(taskId, actor)
    if (!task.dueDate)
      throw new BadRequestException('A tarefa precisa de data e horário.')
    const row = await this.connection(actor)
    if (row.status !== 'connected')
      throw new ConflictException('Reconecte Google ou finalize a desconexão.')
    try {
      const credentials = this.credentials(row.token, actor)
      const tokenResponse = await this.token({
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
      })
      if (!tokenResponse.ok) {
        if (tokenResponse.status === 400 || tokenResponse.status === 401)
          await this.source.query(
            'UPDATE google_connections SET status=\'reconnect\' WHERE "ownerId"=$1 AND version=$2',
            [actor, row.version],
          )
        throw new Error('Renovação')
      }
      const tokens = (await tokenResponse.json()) as {
        access_token?: string
        refresh_token?: string
      }
      if (!tokens.access_token) throw new Error('Token ausente')
      if (tokens.refresh_token)
        await this.source.query(
          'UPDATE google_connections SET token=$3 WHERE "ownerId"=$1 AND version=$2',
          [
            actor,
            row.version,
            this.encrypt(
              JSON.stringify({
                ...credentials,
                refreshToken: tokens.refresh_token,
              }),
              actor,
            ),
          ],
        )
      const current = await this.connection(actor)
      if (current.version !== row.version || current.status !== 'connected')
        throw new Error('Vínculo mudou')
      const eventId = createHash('sha256')
        .update(`colabora:${actor}:${taskId}`)
        .digest('hex')
      const body = {
        summary: task.title,
        description: task.description ?? '',
        start: { dateTime: new Date(task.dueDate).toISOString() },
        end: {
          dateTime: new Date(
            new Date(task.dueDate).getTime() + task.estimatedTime * 60000,
          ).toISOString(),
        },
      }
      const headers = {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      }
      const base =
        'https://www.googleapis.com/calendar/v3/calendars/primary/events'
      const options = {
        headers,
        redirect: 'error' as const,
        signal: AbortSignal.timeout(10000),
      }
      let response = await fetch(`${base}/${eventId}?sendUpdates=none`, {
        ...options,
        method: 'PUT',
        body: JSON.stringify(body),
      })
      if (response.status === 404) {
        response = await fetch(`${base}?sendUpdates=none`, {
          ...options,
          method: 'POST',
          body: JSON.stringify({ id: eventId, ...body }),
        })
        if (response.status === 409)
          response = await fetch(`${base}/${eventId}?sendUpdates=none`, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(body),
          })
      }
      if (!response.ok) throw new Error('Calendar')
      await this.source.query(
        'INSERT INTO google_calendar_sync("ownerId","taskId","eventId") SELECT $1,$2,$3 WHERE EXISTS (SELECT 1 FROM google_connections WHERE "ownerId"=$1 AND version=$4 AND status=\'connected\') ON CONFLICT ("ownerId","taskId") DO UPDATE SET "eventId"=EXCLUDED."eventId","syncedAt"=now()',
        [actor, taskId, eventId, row.version],
      )
      return { synced: true }
    } catch {
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar. Confira a conexão Google e tente novamente.',
      )
    }
  }
}
