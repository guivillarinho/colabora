import { Flame, Leaf, Sparkles, Sun, UserRound, Waves } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from './auth-context'
import type { AuthAvatar } from './auth-api'
import {
  apiBase,
  clearHttpSession,
  sessionExpiredEvent,
} from '@/lib/http-client'

declare const process: { env: { VITE_USER_AVATAR_URL?: string } }

export const avatarPresets = [
  {
    id: 'violet',
    label: 'Roxo',
    className: 'bg-pastel-purple text-pastel-purple-foreground',
    icon: Sparkles,
  },
  {
    id: 'leaf',
    label: 'Folha',
    className: 'bg-pastel-green text-pastel-green-foreground',
    icon: Leaf,
  },
  {
    id: 'wave',
    label: 'Onda',
    className: 'bg-pastel-blue text-pastel-blue-foreground',
    icon: Waves,
  },
  {
    id: 'sun',
    label: 'Sol',
    className: 'bg-pastel-yellow text-pastel-yellow-foreground',
    icon: Sun,
  },
  {
    id: 'ember',
    label: 'Brasa',
    className: 'bg-pastel-red text-pastel-red-foreground',
    icon: Flame,
  },
] as const

export function presetById(id: string) {
  return avatarPresets.find((preset) => preset.id === id) ?? null
}

type UserAvatarProps = {
  size?: 'md' | 'lg' | 'xl'
}

export function UserAvatar({ size = 'md' }: UserAvatarProps) {
  const { user } = useAuth()
  const avatar = user?.avatar ?? null
  const userId = user?.id
  const name = user?.name ?? 'usuário'
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageFailed, setImageFailed] = useState(false)
  const revision = avatar?.kind === 'image' ? avatar.revision : null
  const placeholder = process.env.VITE_USER_AVATAR_URL || ''
  const frame =
    size === 'xl'
      ? 'size-28 text-2xl [&_svg]:size-12 sm:size-32'
      : size === 'lg'
        ? 'size-16 text-base'
        : 'size-11'

  useEffect(() => {
    if (!revision || !userId) return
    const controller = new AbortController()
    let objectUrl: string | null = null
    let active = true
    setImageFailed(false)
    fetch(`${apiBase}/users/me/avatar`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'X-Session-User': userId },
    })
      .then(async (response) => {
        if (response.status === 401) {
          clearHttpSession()
          window.dispatchEvent(new Event(sessionExpiredEvent))
          throw new Error('Sua sessão expirou.')
        }
        if (!response.ok) throw new Error('Foto indisponível.')
        objectUrl = URL.createObjectURL(await response.blob())
        if (active) setImageUrl(objectUrl)
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setImageFailed(true)
      })
    return () => {
      active = false
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setImageUrl(null)
    }
  }, [revision, userId])

  const preset = avatar?.kind === 'preset' ? presetById(avatar.id) : null
  const label = avatarLabel(avatar, name)
  const showPlaceholder = !avatar && Boolean(placeholder) && !imageFailed

  return (
    <div
      className={`flex ${frame} shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-secondary text-secondary-foreground`}
    >
      {preset ? (
        <PresetGlyph label={label} preset={preset} />
      ) : imageUrl && !imageFailed && avatar?.kind === 'image' ? (
        <img alt={label} className="size-full object-cover" src={imageUrl} />
      ) : showPlaceholder ? (
        <img
          alt={label}
          className="size-full object-cover"
          src={placeholder}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span
          aria-label={label}
          className="flex size-full items-center justify-center"
          role="img"
        >
          <UserRound
            aria-hidden="true"
            className={size === 'lg' ? 'size-8' : 'size-6'}
          />
        </span>
      )}
    </div>
  )
}

function PresetGlyph({
  preset,
  label,
}: {
  preset: (typeof avatarPresets)[number]
  label: string
}) {
  const Icon = preset.icon
  return (
    <span
      aria-label={label}
      className={`flex size-full items-center justify-center ${preset.className}`}
      role="img"
    >
      <Icon aria-hidden="true" />
    </span>
  )
}

function avatarLabel(avatar: AuthAvatar | null, name: string): string {
  if (avatar?.kind === 'preset') {
    const preset = presetById(avatar.id)
    return preset ? `Avatar ${preset.label} de ${name}` : `Perfil de ${name}`
  }
  if (avatar?.kind === 'image') return `Foto de ${name}`
  return `Perfil de ${name}`
}
