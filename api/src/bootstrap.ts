import { RequestMethod, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { mkdirSync } from 'node:fs'
import helmet from 'helmet'
import passport from 'passport'

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
  const origins = (
    process.env.WEB_ORIGIN ??
    (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173')
  )
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
  app.enableCors({
    credentials: true,
    origin: [
      ...new Set(
        origins.flatMap((origin) => [
          origin,
          origin.includes('127.0.0.1')
            ? origin.replace('127.0.0.1', 'localhost')
            : origin.replace('localhost', '127.0.0.1'),
        ]),
      ),
    ],
  })
  if (!process.env.VERCEL) {
    mkdirSync(uploadsDirectory(), { recursive: true })
  }
  return app
}
