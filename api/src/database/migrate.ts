import 'reflect-metadata'
import { DataSource, MigrationExecutor } from 'typeorm'
import { InitialSchema1793448000000 } from './migrations/1793448000000-initial-schema'
import { Task } from '../modules/tasks/entities/task.entity'
import { AgendaItem } from '../modules/agenda/entities/agenda-item.entity'
import { FocusSession } from '../modules/focus-sessions/entities/focus-session.entity'

async function migrate() {
  if (!process.env.DATABASE_URL)
    throw new Error('Configure DATABASE_URL antes de publicar.')
  const source = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
    ssl:
      process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    entities: [Task, AgendaItem, FocusSession],
    migrations: [InitialSchema1793448000000],
    synchronize: false,
    extra: { max: 2 },
  })
  await source.initialize()
  const lock = source.createQueryRunner()
  try {
    await lock.connect()
    await lock.startTransaction()
    await lock.query('SELECT pg_advisory_xact_lock(193731, 1)')
    const executor = new MigrationExecutor(source, lock)
    await executor.executePendingMigrations()
    await lock.commitTransaction()
    console.log('Migrações de produção concluídas.')
  } finally {
    if (lock.isTransactionActive) await lock.rollbackTransaction()
    await lock.release()
    await source.destroy()
  }
}

migrate().catch(() => {
  console.error(
    'Não foi possível preparar o banco. Confira DATABASE_URL e a conexão do provedor.',
  )
  process.exitCode = 1
})
