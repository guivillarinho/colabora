import { useEffect, useState } from 'react'
import { presetById } from '@/features/auth/user-avatar'
import { useAuth } from '@/features/auth/auth-context'
import { apiBase } from '@/lib/http-client'
import type { Person } from '../types/task'

export function PersonAvatar({ person }: { person: Person }) {
  const { user } = useAuth()
  const viewerId = user?.id
  const [url, setUrl] = useState<string | null>(null)
  const revision =
    person.avatar?.kind === 'image' ? person.avatar.revision : null
  useEffect(() => {
    if (!revision || !viewerId) return
    const controller = new AbortController()
    let objectUrl: string | null = null
    fetch(`${apiBase}/users/directory/${person.id}/avatar`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'X-Session-User': viewerId },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Foto indisponível')
        const blob = await response.blob()
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => undefined)
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [person.id, revision, viewerId])
  const preset =
    person.avatar?.kind === 'preset' ? presetById(person.avatar.id) : null
  const Icon = preset?.icon
  const initials = person.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('pt-BR')
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-medium ${preset?.className ?? 'bg-secondary text-secondary-foreground'}`}
    >
      {url ? (
        <img
          alt={`Foto de ${person.name}`}
          className="size-full object-cover"
          src={url}
          onError={() => setUrl(null)}
        />
      ) : Icon ? (
        <Icon aria-hidden="true" className="size-4" />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  )
}
