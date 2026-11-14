import { useEffect, useState } from 'react'

import { useAuth } from '@/features/auth/auth-context'
import { presetById } from '@/features/auth/user-avatar'
import {
  apiBase,
  clearHttpSession,
  sessionExpiredEvent,
} from '@/lib/http-client'

import type { Task } from '../types/task'

const assignmentBadges = {
  pending: {
    label: 'Aguardando aceite',
    className:
      'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
  },
  accepted: {
    label: 'Aceita',
    className:
      'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
  },
  declined: {
    label: 'Recusada',
    className: 'bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-200',
  },
} as const

export function TaskAssigneeBadge({
  task,
  showLabel = false,
}: {
  task: Task
  showLabel?: boolean
}) {
  const { user } = useAuth()
  const assignee = task.assignedTo
  const assignment =
    !showLabel &&
    assignee &&
    assignee.id !== task.createdById &&
    task.assignmentStatus
      ? assignmentBadges[task.assignmentStatus]
      : null
  const name = assignee?.name?.trim() || 'Sem responsável'
  const avatar = assignee?.id === user?.id ? user?.avatar : assignee?.avatar
  const preset = avatar?.kind === 'preset' ? presetById(avatar.id) : null
  const Icon = preset?.icon
  const revision = avatar?.kind === 'image' ? avatar.revision : null
  const initials = assignee
    ? name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
        .join('')
    : '—'

  return (
    <p className="flex w-full min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <span
        aria-hidden={showLabel || undefined}
        aria-label={showLabel ? undefined : `Responsável: ${name}`}
        className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground"
        role={showLabel ? undefined : 'img'}
      >
        {preset && Icon ? (
          <span
            className={`grid size-full place-items-center ${preset.className}`}
          >
            <Icon aria-hidden="true" className="size-3.5" />
          </span>
        ) : revision && user ? (
          <AssigneeImage
            key={`${user.id}:${task.id}:${assignee?.id}:${revision}`}
            taskId={task.id}
            viewerId={user.id}
            fallback={initials}
          />
        ) : (
          initials
        )}
      </span>
      <span className={showLabel ? 'min-w-0 text-sm' : 'min-w-0 truncate'}>
        {showLabel ? `Responsável: ${assignee ? name : 'não atribuído'}` : name}
      </span>
      {assignment ? (
        <span
          aria-label={`Aceite do responsável: ${assignment.label}`}
          className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${assignment.className}`}
        >
          {assignment.label}
        </span>
      ) : null}
    </p>
  )
}

function AssigneeImage({
  taskId,
  viewerId,
  fallback,
}: {
  taskId: string
  viewerId: string
  fallback: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | null = null
    let active = true
    fetch(`${apiBase}/tasks/${taskId}/assignee/avatar`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'X-Session-User': viewerId },
    })
      .then(async (response) => {
        if (response.status === 401 && active) {
          clearHttpSession()
          window.dispatchEvent(new Event(sessionExpiredEvent))
        }
        if (!response.ok) throw new Error('Foto indisponível.')
        const blob = await response.blob()
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setFailed(true)
      })
    return () => {
      active = false
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [taskId, viewerId])

  return url && !failed ? (
    <img
      alt=""
      className="size-full object-cover"
      src={url}
      onError={() => setFailed(true)}
    />
  ) : (
    fallback
  )
}
