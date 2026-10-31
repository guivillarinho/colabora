import { createApplication } from './bootstrap'

async function bootstrap() {
  const app = await createApplication()
  app.enableShutdownHooks()
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0')
}

bootstrap()
