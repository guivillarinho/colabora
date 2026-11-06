import { useState } from 'react'

import { useAuth } from '@/features/auth/auth-context'

import type { Task } from '../types/task'

declare const process: {
  env: {
    VITE_USER_AVATAR_URL?: string
  }
}

export function TaskCreatorBadge({ task }: { task: Task }) {
  const { user } = useAuth()
  const [imageUnavailable, setImageUnavailable] = useState(false)
  const name = task.createdBy?.name?.trim() || 'Usuário'
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
    .join('')
  const imageUrl =
    user && task.createdBy?.id === user.id
      ? process.env.VITE_USER_AVATAR_URL || ''
      : ''

  return (
    <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <span
        aria-label={`Criada por ${name}`}
        className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground"
        role="img"
      >
        {imageUrl && !imageUnavailable ? (
          <img
            alt=""
            className="size-full object-cover"
            src={imageUrl}
            onError={() => setImageUnavailable(true)}
          />
        ) : (
          initials || 'U'
        )}
      </span>
      atribuído
    </p>
  )
}
