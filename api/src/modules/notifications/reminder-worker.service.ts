import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { NotificationsService } from './notifications.service'

@Injectable()
export class ReminderWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ReminderWorker.name)
  private timer?: ReturnType<typeof setInterval>
  private running?: Promise<void>

  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    // Serverless invocations may be suspended after responding. Use the external
    // scheduled dispatcher there instead of relying on an in-process timer.
    if (this.config.get<string>('VERCEL')) return
    this.timer = setInterval(() => this.tick(), 15_000)
    this.timer.unref()
    this.tick()
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer)
    await this.running
  }

  private tick(): void {
    if (this.running) return
    this.running = this.notifications
      .dispatchDueReminders()
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.error('Falha ao verificar lembretes de tarefas.', error)
      })
      .finally(() => {
        this.running = undefined
      })
  }
}
