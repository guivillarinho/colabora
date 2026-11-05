import { Pomodoro1793880000000 } from './migrations/1793880000000-pomodoro'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InitialSchema1793448000000 } from './migrations/1793448000000-initial-schema'
import { UserSecurity1793534400000 } from './migrations/1793534400000-user-security'
import { PushNotifications1793620800000 } from './migrations/1793620800000-push-notifications'
import { PasswordReset1793707200000 } from './migrations/1793707200000-password-reset'
import { TaskExecutionTime1793793600000 } from './migrations/1793793600000-task-execution-time'
import { databaseSchema } from './schema'

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get<string>('DATABASE_URL'),
        host: config.get<string>('DB_HOST', 'localhost'),
        port: Number(config.get<string>('DB_PORT', '5432')),
        username: config.get<string>('DB_USER', 'colabora'),
        password: config.get<string>('DB_PASSWORD', 'colabora'),
        database: config.get<string>('DB_NAME', 'colabora'),
        ssl:
          config.get<string>('DB_SSL') === 'true'
            ? { rejectUnauthorized: true }
            : undefined,
        schema: databaseSchema(config.get<string>('DB_SCHEMA')),
        extra: {
          max: Number(config.get<string>('DB_POOL_SIZE', '5')),
        },
        autoLoadEntities: true,
        synchronize: false,
        migrations: [
          InitialSchema1793448000000,
          UserSecurity1793534400000,
          PushNotifications1793620800000,
          PasswordReset1793707200000,
          TaskExecutionTime1793793600000,
          Pomodoro1793880000000,
        ],
        migrationsRun: !process.env.VERCEL,
      }),
    }),
  ],
})
export class DatabaseModule {}
