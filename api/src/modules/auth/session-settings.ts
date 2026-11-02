import type { ConfigService } from '@nestjs/config'

export function sessionSettings(config: ConfigService) {
  const secure =
    process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)
  const idleMs = Number(config.get('SESSION_IDLE_MINUTES', '30')) * 60_000
  const absoluteMs =
    Number(config.get('SESSION_ABSOLUTE_HOURS', '168')) * 3_600_000
  if (
    !Number.isFinite(idleMs) ||
    idleMs < 60_000 ||
    idleMs > 86_400_000 ||
    !Number.isFinite(absoluteMs) ||
    absoluteMs < idleMs ||
    absoluteMs > 30 * 86_400_000
  ) {
    throw new Error('Política de expiração de sessão inválida.')
  }
  return {
    secure,
    idleMs,
    absoluteMs,
    name: secure ? '__Host-colabora.sid' : 'colabora.sid',
  }
}
