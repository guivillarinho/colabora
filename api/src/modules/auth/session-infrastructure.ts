import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import { Pool } from 'pg'
import { sessionSettings } from './session-settings'
import { databaseSchema } from '../../database/schema'

@Injectable()
export class SessionInfrastructure implements OnApplicationShutdown {
  private pool?: Pool
  private store?: connectPgSimple.PGStore
  constructor(private readonly config: ConfigService) {}

  middleware() {
    const secret = this.config.get<string>('SESSION_SECRET')
    if (!secret || secret.length < 32)
      throw new Error(
        'Configure SESSION_SECRET com pelo menos 32 caracteres aleatórios.',
      )
    const settings = sessionSettings(this.config)
    const schema = databaseSchema(this.config.get<string>('DB_SCHEMA'))
    this.pool = new Pool({
      connectionString: this.config.get<string>('DATABASE_URL'),
      host: this.config.get<string>('DB_HOST', 'localhost'),
      port: Number(this.config.get('DB_PORT', '5432')),
      user: this.config.get<string>('DB_USER', 'colabora'),
      password: this.config.get<string>('DB_PASSWORD', 'colabora'),
      database: this.config.get<string>('DB_NAME', 'colabora'),
      ssl:
        this.config.get('DB_SSL') === 'true'
          ? { rejectUnauthorized: true }
          : undefined,
      max: 2,
    })
    this.pool.on('error', () =>
      console.error('Falha de conexão no armazenamento de sessões.'),
    )
    const PgStore = connectPgSimple(session)
    this.store = new PgStore({
      pool: this.pool,
      tableName: 'app_sessions',
      schemaName: schema,
      createTableIfMissing: false,
      pruneSessionInterval: false,
      errorLog: () => console.error('Falha no armazenamento de sessões.'),
    })
    return session({
      store: this.store,
      secret,
      name: settings.name,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: settings.secure,
        sameSite: 'lax',
        path: '/',
        maxAge: settings.idleMs,
      },
    })
  }

  async onApplicationShutdown() {
    this.store?.close()
    await this.pool?.end()
  }
}
