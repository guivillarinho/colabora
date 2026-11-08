import { useEffect, useRef, useState } from 'react'
import { cn } from 'cn'
import {
  Bell,
  BellOff,
  CalendarDays,
  Camera,
  ChartNoAxesCombined,
  ChevronRight,
  LogOut,
  Palette,
} from 'lucide-react'

import { PalettePicker } from '@/components/palette-picker'
import { ThemeModePicker } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { GoogleSettings } from '@/features/google/google-settings'
import { useTasks } from '@/features/tasks/tasks-context'
import { TaskExecutionChart } from '@/features/dashboard/components/task-execution-chart'
import { apiRequest } from '@/lib/http-client'
import { useAuth } from './auth-context'
import { AvatarSettings } from './avatar-settings'
import { UserAvatar } from './user-avatar'

type PushKey = { publicKey: string }
type SubscriptionKeys = { p256dh?: string; auth?: string }
type SubscriptionJSON = {
  endpoint: string
  keys?: SubscriptionKeys
}

const profileOptions = [
  {
    id: 'appearance',
    title: 'Aparência',
    description: 'Tema e cores do aplicativo',
    detail:
      'Escolha o tema claro, escuro ou do sistema e a sua paleta de cores.',
    icon: Palette,
  },
  {
    id: 'notifications',
    title: 'Notificações',
    description: 'Lembretes e avisos de tarefas',
    detail: 'Gerencie os avisos do Colabora neste dispositivo.',
    icon: Bell,
  },
  {
    id: 'google',
    title: 'Google Agenda',
    description: 'Conecte seu calendário',
    detail: 'Gerencie a conexão com sua conta Google e o envio de tarefas.',
    icon: CalendarDays,
  },
] as const

type ProfileOption =
  'avatar' | 'productivity' | (typeof profileOptions)[number]['id']

export function AccountPage() {
  const { user, logout } = useAuth()
  const { tasks } = useTasks()
  const [selected, setSelected] = useState<ProfileOption | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const option = profileOptions.find((item) => item.id === selected)
  const title =
    selected === 'avatar'
      ? 'Foto de perfil'
      : selected === 'productivity'
        ? 'Minha produtividade'
        : option?.title
  const description =
    selected === 'avatar'
      ? 'Envie uma imagem PNG, JPEG ou WebP de até 10 MB.'
      : selected === 'productivity'
        ? 'Acompanhe o tempo dedicado às suas tarefas.'
        : option?.detail
  const stats = [
    {
      label: 'Pendentes',
      value: tasks.filter((task) => task.status === 'pending').length,
    },
    {
      label: 'Em andamento',
      value: tasks.filter((task) => task.status === 'in_progress').length,
    },
    {
      label: 'Concluídas',
      value: tasks.filter((task) => task.status === 'completed').length,
    },
  ]

  function openSettings(option: ProfileOption, trigger: HTMLButtonElement) {
    triggerRef.current = trigger
    setSelected(option)
  }

  async function leave() {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await logout()
    } catch {
      setError('Não foi possível encerrar a sessão. Tente novamente.')
      setPending(false)
    }
  }

  return (
    <section
      aria-label="Perfil do usuário"
      className="mx-auto grid w-full min-w-0 max-w-xl gap-6 sm:gap-8"
    >
      <div className="grid min-w-0 justify-items-center gap-5 px-2 pt-2 text-center sm:pt-4">
        <div className="relative">
          <div className="rounded-full border border-border bg-card p-2">
            <UserAvatar size="xl" />
          </div>
          <Button
            aria-label="Editar foto de perfil"
            aria-haspopup="dialog"
            className="absolute right-0 bottom-1 size-11 rounded-full border-4 border-background shadow-sm"
            size="icon"
            type="button"
            onClick={(event) => openSettings('avatar', event.currentTarget)}
          >
            <Camera aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <div className="grid min-w-0 w-full gap-1">
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
            {user?.name ?? 'Sua conta'}
          </h1>
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {user?.email}
          </p>
        </div>
        <dl
          aria-label="Resumo das tarefas"
          className="surface-panel grid w-full grid-cols-3 divide-x rounded-2xl border px-2 py-4 sm:py-5"
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="grid content-start gap-1 px-1 sm:px-3"
            >
              <dd className="order-first text-2xl font-semibold tabular-nums">
                {stat.value}
              </dd>
              <dt className="text-xs leading-snug text-muted-foreground sm:text-sm">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>
      </div>

      <button
        aria-haspopup="dialog"
        className="surface-panel flex min-w-0 items-center gap-3 rounded-2xl border border-primary/20 bg-primary/10 p-4 text-left transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
        type="button"
        onClick={(event) => openSettings('productivity', event.currentTarget)}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <ChartNoAxesCombined aria-hidden="true" className="size-5" />
        </span>
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="font-semibold">Minha produtividade</span>
          <span className="text-sm text-muted-foreground">
            Seu tempo por categoria
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-primary"
        />
      </button>

      <div className="grid gap-3">
        <h2 className="px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Preferências
        </h2>
        <div className="surface-panel divide-y overflow-hidden rounded-2xl border">
          {profileOptions.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                aria-haspopup="dialog"
                className="flex w-full min-w-0 items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
                type="button"
                onClick={(event) => openSettings(item.id, event.currentTarget)}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full border border-border/80 text-foreground/80">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <Button
          className="h-12 w-full justify-start gap-3 rounded-xl px-4 text-destructive hover:bg-destructive/10 hover:text-destructive"
          variant="ghost"
          onClick={leave}
          disabled={pending}
        >
          <LogOut aria-hidden="true" className="size-5" />
          {pending ? 'Saindo...' : 'Sair da conta'}
        </Button>
        {error ? (
          <p role="alert" className="px-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent
          className={cn(
            'flex max-h-[85svh] flex-col overflow-hidden sm:max-w-lg',
            selected === 'avatar' && 'gap-3 p-4 sm:gap-4 sm:p-6',
          )}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            triggerRef.current?.focus()
          }}
        >
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div
            className={cn(
              'min-h-0 gap-4',
              selected === 'avatar'
                ? 'flex min-h-0 flex-1 overflow-hidden px-1 py-1'
                : 'grid overflow-y-auto -mx-1 px-1 pb-1 [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0 [&>section]:shadow-none ',
            )}
          >
            {selected === 'avatar' ? (
              <AvatarSettings onDone={() => setSelected(null)} />
            ) : null}
            {selected === 'appearance' ? (
              <>
                <ThemeModePicker />
                <PalettePicker />
              </>
            ) : null}
            {selected === 'notifications' ? <NotificationSettings /> : null}
            {selected === 'google' ? <GoogleSettings /> : null}
            {selected === 'productivity' ? (
              <TaskExecutionChart tasks={tasks} />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function NotificationSettings() {
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

  return (
    <section className="grid gap-3">
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
