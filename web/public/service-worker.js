self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Colabora', {
      body: payload.body || 'Você tem uma atualização.',
      icon: '/colabora-push.svg',
      badge: '/colabora-push.svg',
      data: { url: payload.url || '/' },
      tag: payload.tag,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin)
  if (target.origin !== self.location.origin) return
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clients) => {
        const existing = clients.find((client) => 'focus' in client)
        if (existing && 'navigate' in existing) {
          await existing.navigate(target.href)
          return existing.focus()
        }
        return self.clients.openWindow(target.href)
      }),
  )
})
