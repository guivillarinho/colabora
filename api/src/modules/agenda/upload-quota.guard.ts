import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import type { Identity } from '../auth/entities/user.entity'
import { RateLimitService } from '../auth/rate-limit.service'

@Injectable()
export class UploadQuotaGuard implements CanActivate {
  constructor(private readonly limits: RateLimitService) {}
  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: Identity }>()
    await this.limits.consume('uploads', request.user.id, 30, 3600)
    return true
  }
}
