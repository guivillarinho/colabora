import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { mkdirSync } from 'node:fs'
import express from 'express'

import { AppModule } from './app.module'
import { uploadsDirectory } from './uploads-directory'

export async function createApplication() {
  const app = await NestFactory.create(AppModule)
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
    app.use('/uploads/agenda', express.static(uploadsDirectory()))
  }
  return app
}
