import { Hono } from 'hono'

const app = new Hono()

app.post('/', async (context) => {
  const secret = process.env.REMINDER_DISPATCH_SECRET
  const applicationUrl = process.env.COLABORA_API_URL
  if (!secret || !applicationUrl)
    return context.json({ message: 'Agendador sem configuração.' }, 503)

  const invocationId = context.req.header('x-neon-trigger-invocation-id')
  if (!invocationId) return context.json({ message: 'Origem inválida.' }, 403)

  const result = await fetch(
    `${applicationUrl.replace(/\/$/, '')}/api/notifications/dispatch-reminders`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25_000),
    },
  ).catch(() => null)
  if (!result) {
    console.error('reminders dispatch failed', {
      invocationId,
      reason: 'API indisponível',
    })
    return context.json({ message: 'API indisponível.' }, 502)
  }
  const payload = await result
    .json()
    .catch(() => ({ message: 'API indisponível.' }))
  console.log('reminders dispatch', {
    invocationId,
    status: result.status,
    delivered: payload.delivered,
  })
  return result.ok ? context.json(payload) : context.json(payload, 502)
})

export default app
