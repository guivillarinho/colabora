import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { CurrentUser, Public } from './auth.decorators'
import { LoginDto, RegisterDto } from './dto/auth.dto'
import { sessionSettings } from './session-settings'
import type { Identity } from './entities/user.entity'
import type { SessionResponse } from './auth.types'
import { RateLimitService } from './rate-limit.service'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly limits: RateLimitService,
  ) {}

  @Public()
  @Get('csrf')
  async csrf(@Req() request: Request) {
    await this.limits.consume(
      'csrf-ip',
      request.ip ?? 'unknown',
      Number(this.config.get('AUTH_CSRF_LIMIT', '60')),
      60,
    )
    request.session.csrfToken ??= randomBytes(32).toString('hex')
    return { csrfToken: request.session.csrfToken }
  }

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
  ): Promise<SessionResponse> {
    return this.signIn(
      await this.auth.register(dto, request.ip ?? 'unknown'),
      request,
    )
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
  ): Promise<SessionResponse> {
    return this.signIn(
      await this.auth.login(dto, request.ip ?? 'unknown'),
      request,
    )
  }

  @Get('me')
  me(@CurrentUser() user: Identity, @Req() request: Request): SessionResponse {
    return { user, csrfToken: request.session.csrfToken! }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.revokeSession(request.sessionID)
    await new Promise<void>((resolve, reject) =>
      request.logOut((error) => (error ? reject(error) : resolve())),
    )
    await new Promise<void>((resolve, reject) =>
      request.session.destroy((error) => (error ? reject(error) : resolve())),
    )
    const settings = sessionSettings(this.config)
    response.clearCookie(settings.name, {
      path: '/',
      httpOnly: true,
      secure: settings.secure,
      sameSite: 'lax',
    })
  }

  private async signIn(
    user: Identity,
    request: Request,
  ): Promise<SessionResponse> {
    await this.auth.revokeSession(request.sessionID)
    await new Promise<void>((resolve, reject) =>
      request.logIn(user, (error) => (error ? reject(error) : resolve())),
    )
    const now = Date.now()
    request.session.authStartedAt = now
    request.session.authLastSeenAt = now
    request.session.csrfToken = randomBytes(32).toString('hex')
    request.session.cookie.maxAge = sessionSettings(this.config).idleMs
    await new Promise<void>((resolve, reject) =>
      request.session.save((error) => (error ? reject(error) : resolve())),
    )
    return { user, csrfToken: request.session.csrfToken }
  }
}
