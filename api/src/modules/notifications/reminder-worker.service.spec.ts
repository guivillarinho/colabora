import { ConfigService } from '@nestjs/config'
import { NotificationsService } from './notifications.service'
import { ReminderWorker } from './reminder-worker.service'

describe('ReminderWorker', () => {
  let dispatch: jest.Mock
  let worker: ReminderWorker

  beforeEach(() => {
    jest.useFakeTimers()
    dispatch = jest.fn().mockResolvedValue({ delivered: 1 })
    worker = new ReminderWorker(
      { dispatchDueReminders: dispatch } as unknown as NotificationsService,
      new ConfigService(),
    )
  })

  afterEach(async () => {
    await worker.onApplicationShutdown()
    jest.useRealTimers()
  })

  it('verifica ao iniciar e continua verificando sem requisições HTTP', async () => {
    worker.onApplicationBootstrap()
    expect(dispatch).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(30_000)
    expect(dispatch).toHaveBeenCalledTimes(3)
    await worker.onApplicationShutdown()
    await jest.advanceTimersByTimeAsync(30_000)
    expect(dispatch).toHaveBeenCalledTimes(3)
  })

  it('não sobrepõe verificações enquanto o envio está em andamento', async () => {
    let finish!: () => void
    dispatch.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    worker.onApplicationBootstrap()
    await jest.advanceTimersByTimeAsync(60_000)
    expect(dispatch).toHaveBeenCalledTimes(1)
    finish()
    await worker.onApplicationShutdown()
  })

  it('usa o agendador externo na Vercel', () => {
    worker = new ReminderWorker(
      { dispatchDueReminders: dispatch } as unknown as NotificationsService,
      new ConfigService({ VERCEL: '1' }),
    )
    worker.onApplicationBootstrap()
    expect(dispatch).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })
})
