import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  app.enableCors({
    origin: webOrigins(),
  })

  await app.listen(process.env.PORT ?? 3000)
}

function webOrigins(): string[] {
  const configured = process.env.WEB_ORIGIN ?? 'http://localhost:5173'
  const alternate = configured.includes('127.0.0.1')
    ? configured.replace('127.0.0.1', 'localhost')
    : configured.replace('localhost', '127.0.0.1')

  return [configured, alternate]
}

bootstrap()
