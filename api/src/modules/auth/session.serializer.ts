import { Injectable } from '@nestjs/common'
import { PassportSerializer } from '@nestjs/passport'
import { AuthService } from './auth.service'
import type { Identity } from './entities/user.entity'

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly auth: AuthService) {
    super()
  }

  serializeUser(
    user: Identity,
    done: (error: Error | null, id?: string) => void,
  ) {
    done(null, user.id)
  }

  deserializeUser(
    id: string,
    done: (error: Error | null, user?: Identity | false) => void,
  ) {
    this.auth
      .findIdentity(id)
      .then((user) => done(null, user ?? false))
      .catch(() => done(new Error('Não foi possível validar a sessão.')))
  }
}
