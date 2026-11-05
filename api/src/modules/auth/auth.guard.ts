import type { Identity } from './entities/user.entity'
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'

import { AuthService } from './auth.service'
import { machineRoute, publicRoute } from './auth.decorators'
import { sessionSettings } from './session-settings'
import './auth.types'
import { webOrigins } from './web-origins'

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: Identity }>()
    const response = context.switchToHttp().getResponse<Response>()
    const isPublic = this.reflector.getAllAndOverride<boolean>(publicRoute, [
      context.getHandler(),
      context.getClass(),
    ])
    const isMachineRoute = this.reflector.getAllAndOverride<boolean>(
      machineRoute,
      [context.getHandler(), context.getClass()],
    )
    const settings = sessionSettings(this.config)
    if (request.user) {
      const now = Date.now()
      const started = request.session.authStartedAt ?? 0
      const last = request.session.authLastSeenAt ?? 0
      if (
        now - started >= settings.absoluteMs ||
        now - last >= settings.idleMs ||
        (await this.auth.isRevoked(request.sessionID))
      ) {
        await this.auth.revokeSession(request.sessionID)
        await new Promise<void>((resolve, reject) =>
          request.session.destroy((error) =>
            error ? reject(error) : resolve(),
          ),
        )
        response.clearCookie(settings.name, {
          path: '/',
          httpOnly: true,
          secure: settings.secure,
          sameSite: 'lax',
        })
        throw new UnauthorizedException('Sua sessão expirou. Entre novamente.')
      }
      request.session.authLastSeenAt = now
      request.session.cookie.maxAge = Math.min(
        settings.idleMs,
        settings.absoluteMs - (now - started),
      )
    }
    if (!isPublic && !request.user)
      throw new UnauthorizedException('Entre para continuar.')
    const expectedUser = request.get('x-session-user')
    if (request.user && expectedUser && expectedUser !== request.user.id)
      throw new HttpException(
        {
          statusCode: 409,
          code: 'session_changed',
          message: 'A conta conectada mudou. Entre novamente.',
        },
        409,
      )
    if (
      !isMachineRoute &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    ) {
      const expected = request.session?.csrfToken
      const received = request.get('x-csrf-token')
      const origin = request.get('origin')
      const allowed = webOrigins(this.config.get<string>('WEB_ORIGIN'))
      allowed.push(`${request.protocol}://${request.get('host')}`)
      if (
        request.get('sec-fetch-site') === 'cross-site' ||
        !origin ||
        !allowed.includes(origin) ||
        !expected ||
        !received ||
        Buffer.byteLength(received) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
      ) {
        throw new ForbiddenException(
          'Requisição de segurança inválida. Atualize a página e tente novamente.',
        )
      }
    }
    return true
  }
}
