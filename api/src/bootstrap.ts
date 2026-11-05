import { RequestMethod, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { mkdirSync } from 'node:fs'
import helmet from 'helmet'
import passport from 'passport'
import { webOrigins } from './modules/auth/web-origins'

import { AppModule } from './app.module'
import { uploadsDirectory } from './uploads-directory'
import { SessionInfrastructure } from './modules/auth/session-infrastructure'
import { SafeExceptionFilter } from './safe-exception.filter'

export async function createApplication() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'test' ? false : undefined,
  })
  app.useGlobalFilters(new SafeExceptionFilter())
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  })
  const adapter = app.getHttpAdapter().getInstance()
  if (process.env.VERCEL) adapter.set('trust proxy', 1)
  app.use(helmet())
  app.use(
    (
      _request: unknown,
      response: { setHeader: (key: string, value: string) => void },
      next: () => void,
    ) => {
      response.setHeader('Cache-Control', 'private, no-store')
      next()
    },
  )
  app.use(app.get(SessionInfrastructure).middleware())
  app.use(passport.initialize())
  app.use(passport.session())
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  app.enableCors({
    credentials: true,
    origin: webOrigins(process.env.WEB_ORIGIN),
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Session-User'],
  })
  if (!process.env.VERCEL) {
    mkdirSync(uploadsDirectory(), { recursive: true })
  }
  return app
}
