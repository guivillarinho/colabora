import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { GoogleSyncOrchestrator } from './google-sync.orchestrator'

@Injectable()
export class GoogleSyncWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(GoogleSyncWorker.name)
  private timer?: ReturnType<typeof setInterval>
  private running?: Promise<void>
  private lastPoll = 0

  constructor(
    private readonly sync: GoogleSyncOrchestrator,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get<string>('VERCEL')) return
    this.timer = setInterval(() => this.tick(), 20_000)
    this.timer.unref()
  }

  async onApplicationShutdown() {
    clearInterval(this.timer)
    await this.running
  }

  tick() {
    if (this.running) return this.running
    this.running = this.run()
      .catch((error: unknown) => {
        this.logger.error('Falha ao processar a sincronização Google.', error)
      })
      .finally(() => {
        this.running = undefined
      })
    return this.running
  }

  private async run() {
    await this.sync.drain()
    const interval = Number(
      this.config.get<string>('GOOGLE_TASKS_POLL_INTERVAL_MS') ?? 120_000,
    )
    if (Date.now() - this.lastPoll >= interval) {
      this.lastPoll = Date.now()
      await this.sync.pollTasks()
      await this.sync.renewWatches()
    }
  }
}
