import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/http-client'
import { useAuth } from './auth-context'

type PushKey = { publicKey: string }
type SubscriptionKeys = { p256dh?: string; auth?: string }
type SubscriptionJSON = {
  endpoint: string
  keys?: SubscriptionKeys
}

export function AccountPage() {
  const { user, logout } = useAuth()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushAvailable, setPushAvailable] = useState(false)
  const [pushPending, setPushPending] = useState(false)
  const [pushMessage, setPushMessage] = useState<string | null>(null)

  const pushSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  const iosNeedsInstall =
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    !window.matchMedia('(display-mode: standalone)').matches &&
    !(navigator as Navigator & { standalone?: boolean }).standalone

  useEffect(() => {
    if (!pushSupported) return
    let cancelled = false
    Promise.all([
      apiRequest<PushKey>('/notifications/vapid-public-key'),
      navigator.serviceWorker.ready.then((registration) =>
        registration.pushManager.getSubscription(),
      ),
    ])
      .then(([, subscription]) => {
        if (!cancelled) {
          setPushAvailable(true)
          setPushEnabled(Boolean(subscription))
        }
      })
      .catch(() => {
        if (!cancelled) setPushAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [pushSupported])

  async function togglePush() {
    if (!pushSupported || pushPending) return
    setPushPending(true)
    setPushMessage(null)
    try {
      const permissionRequest = pushEnabled
        ? null
        : Notification.requestPermission()
      const registration = await navigator.serviceWorker.ready
      const current = await registration.pushManager.getSubscription()
      if (current) {
        await apiRequest<void>('/notifications/subscriptions', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: current.endpoint }),
        })
        await current.unsubscribe()
        setPushEnabled(false)
        setPushMessage('Notificações desativadas neste dispositivo.')
        return
      }

      const permission = await permissionRequest!
      if (permission !== 'granted') {
        setPushMessage(
          permission === 'denied'
            ? 'Notificações bloqueadas. Altere a permissão nas configurações do navegador.'
            : 'Permita as notificações para ativar os avisos.',
        )
        return
      }
      const { publicKey } = await apiRequest<PushKey>(
        '/notifications/vapid-public-key',
      )
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(publicKey),
      })
      const data = subscription.toJSON() as SubscriptionJSON
      if (!data.keys?.p256dh || !data.keys.auth) {
        await subscription.unsubscribe()
        throw new Error('O navegador não forneceu os dados da inscrição.')
      }
      await apiRequest<void>('/notifications/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: data.endpoint,
          p256dh: data.keys.p256dh,
          auth: data.keys.auth,
        }),
      })
      setPushAvailable(true)
      setPushEnabled(true)
      setPushMessage('Notificações ativadas neste dispositivo.')
    } catch {
      setPushMessage(
        'Não foi possível alterar as notificações. Verifique a conexão e tente novamente.',
      )
    } finally {
      setPushPending(false)
    }
  }

  async function leave() {
    setPending(true)
    try {
      await logout()
    } catch {
      setError('Não foi possível encerrar a sessão. Tente novamente.')
      setPending(false)
    }
  }
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">Seu perfil</h1>
      <p>{user?.name}</p>
      <p className="text-muted-foreground">{user?.email}</p>
      <section className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-3">
          {pushEnabled ? (
            <Bell aria-hidden="true" className="size-5 text-primary" />
          ) : (
            <BellOff
              aria-hidden="true"
              className="size-5 text-muted-foreground"
            />
          )}
          <h2 className="text-lg font-semibold">
            Notificações neste dispositivo
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Receba avisos quando tarefas forem criadas, alteradas, concluídas ou
          removidas em outro dispositivo, e lembretes 10 minutos antes e no
          horário marcado.
        </p>
        {iosNeedsInstall ? (
          <p className="text-sm text-muted-foreground">
            No iPhone ou iPad, adicione o Colabora à Tela de Início e abra pelo
            ícone antes de ativar as notificações.
          </p>
        ) : null}
        {!pushSupported ? (
          <p className="text-sm text-muted-foreground">
            Este navegador não oferece notificações push. Tente em um navegador
            compatível com o site aberto por HTTPS.
          </p>
        ) : (
          <>
            <Button
              className="justify-self-start"
              variant={pushEnabled ? 'outline' : 'default'}
              onClick={togglePush}
              disabled={pushPending || (!pushAvailable && !pushEnabled)}
            >
              {pushPending
                ? 'Aguarde...'
                : pushEnabled
                  ? 'Desativar neste dispositivo'
                  : 'Ativar notificações'}
            </Button>
            {!pushAvailable && !pushEnabled ? (
              <p className="text-sm text-muted-foreground">
                O serviço push ainda não está configurado no servidor.
              </p>
            ) : null}
          </>
        )}
        {pushMessage ? (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {pushMessage}
          </p>
        ) : null}
      </section>
      {error ? <p role="alert">{error}</p> : null}
      <Button
        className="justify-self-start"
        variant="outline"
        onClick={leave}
        disabled={pending}
      >
        {pending ? 'Saindo...' : 'Sair da conta'}
      </Button>
    </section>
  )
}

function decodeApplicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const decoded = atob(
    normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='),
  )
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0))
  return bytes as Uint8Array<ArrayBuffer>
}
