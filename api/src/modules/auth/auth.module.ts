import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PassportModule } from '@nestjs/passport'
import { APP_GUARD } from '@nestjs/core'
import { User } from './entities/user.entity'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { SessionSerializer } from './session.serializer'
import { SessionGuard } from './auth.guard'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { AvatarService } from './avatar.service'
import { AvatarController } from './avatar.controller'
import { RateLimitService } from './rate-limit.service'
import { SessionInfrastructure } from './session-infrastructure'

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule.register({ session: true }),
  ],
  controllers: [AuthController, UsersController, AvatarController],
  providers: [
    AuthService,
    SessionSerializer,
    SessionInfrastructure,
    UsersService,
    AvatarService,
    RateLimitService,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [
    AuthService,
    UsersService,
    AvatarService,
    RateLimitService,
    SessionInfrastructure,
  ],
})
export class AuthModule {}
