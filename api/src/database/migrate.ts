import { GoogleDriveAttachments1796200000000 } from './migrations/1796200000000-google-drive-attachments'
import { GoogleResourceId1796100000000 } from './migrations/1796100000000-google-resource-id'
import { TaskCategories1796000000000 } from './migrations/1796000000000-task-categories'
import { GoogleSyncV21795000000000 } from './migrations/1795000000000-google-sync-v2'
import { ConfigurableReminders1794441600000 } from './migrations/1794441600000-configurable-reminders'
import { AccountPreferences1794355200000 } from './migrations/1794355200000-account-preferences'
import { TaskAssignment1794268800000 } from './migrations/1794268800000-task-assignment'
import { TaskCompletion1794182400000 } from './migrations/1794182400000-task-completion'
import { GoogleCalendar1794009600000 } from './migrations/1794009600000-google-calendar'
import { UserAvatar1794096000000 } from './migrations/1794096000000-user-avatar'
import { Assistant1793923200000 } from './migrations/1793923200000-assistant'
import { Pomodoro1793880000000 } from './migrations/1793880000000-pomodoro'
import 'reflect-metadata'
import { DataSource, MigrationExecutor } from 'typeorm'
import { InitialSchema1793448000000 } from './migrations/1793448000000-initial-schema'
import { UserSecurity1793534400000 } from './migrations/1793534400000-user-security'
import { PushNotifications1793620800000 } from './migrations/1793620800000-push-notifications'
import { PasswordReset1793707200000 } from './migrations/1793707200000-password-reset'
import { TaskExecutionTime1793793600000 } from './migrations/1793793600000-task-execution-time'
import { User } from '../modules/auth/entities/user.entity'
import { Attachment } from '../modules/agenda/entities/attachment.entity'
import { Task } from '../modules/tasks/entities/task.entity'
import { AgendaItem } from '../modules/agenda/entities/agenda-item.entity'
import { FocusSession } from '../modules/focus-sessions/entities/focus-session.entity'
import { PushSubscription } from '../modules/notifications/entities/push-subscription.entity'
import { TaskReminder } from '../modules/notifications/entities/task-reminder.entity'

async function migrate() {
  if (!process.env.DATABASE_URL)
    throw new Error('Configure DATABASE_URL antes de publicar.')
  const source = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
    ssl:
      process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    entities: [
      Task,
      AgendaItem,
      FocusSession,
      User,
      Attachment,
      PushSubscription,
      TaskReminder,
    ],
    migrations: [
      InitialSchema1793448000000,
      UserSecurity1793534400000,
      PushNotifications1793620800000,
      PasswordReset1793707200000,
      TaskExecutionTime1793793600000,
      Pomodoro1793880000000,
      Assistant1793923200000,
      GoogleCalendar1794009600000,
      UserAvatar1794096000000,
      TaskCompletion1794182400000,
      TaskAssignment1794268800000,
      AccountPreferences1794355200000,
      ConfigurableReminders1794441600000,
      GoogleSyncV21795000000000,
      TaskCategories1796000000000,
      GoogleResourceId1796100000000,
      GoogleDriveAttachments1796200000000,
    ],
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
    console.log('Migrações concluídas no banco selecionado.')
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
