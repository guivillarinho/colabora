import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InitialSchema1793448000000 } from './migrations/1793448000000-initial-schema'

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
        extra: { max: Number(config.get<string>('DB_POOL_SIZE', '5')) },
        autoLoadEntities: true,
        synchronize: config.get<string>('NODE_ENV') !== 'production' && !process.env.VERCEL,
        migrations: [InitialSchema1793448000000],
        migrationsRun:
          config.get<string>('NODE_ENV') === 'production' &&
          !process.env.VERCEL,
      }),
    }),
  ],
})
export class DatabaseModule {}
