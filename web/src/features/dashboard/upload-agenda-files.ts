import { put } from '@vercel/blob/client'

import { apiRequest } from '@/lib/http-client'
declare const process: {
  env: { VITE_CLOUD_UPLOADS?: string; VITE_API_URL?: string }
}

const maxFiles = 10
const maxBytes = 10 * 1024 * 1024
export const agendaUploadTimeoutMs = 60_000
const allowedExtension = /^(pdf|docx?|xlsx?|csv|txt|png|jpe?g|webp)$/

export type AgendaUploadFile = { name: string; url: string }

export type AgendaUploadProgress = {
  index: number
  total: number
  name: string
  percentage: number | null
}

export type AgendaUploadOptions = {
  signal?: AbortSignal
  timeoutMs?: number
  onProgress?: (progress: AgendaUploadProgress) => void
}

export class AgendaUploadError extends Error {
  readonly completed: AgendaUploadFile[]
  readonly code: 'cancelled' | 'timeout' | 'invalid' | 'failed'

  constructor(
    message: string,
    code: AgendaUploadError['code'],
    completed: AgendaUploadFile[] = [],
  ) {
    super(message)
    this.name = 'AgendaUploadError'
    this.code = code
    this.completed = completed
  }
}

export async function uploadAgendaFiles(
  files: File[],
  userId: string,
  options: AgendaUploadOptions = {},
): Promise<AgendaUploadFile[]> {
  if (!files.length) return []
  assertFiles(files)
  const completed: AgendaUploadFile[] = []
  const cloud = process.env.VITE_CLOUD_UPLOADS === 'true'
  try {
    for (const [offset, file] of files.entries()) {
      const saved = await uploadFile(file, userId, {
        cloud,
        signal: options.signal,
        timeoutMs: options.timeoutMs ?? agendaUploadTimeoutMs,
        onProgress: (percentage) => {
          options.onProgress?.({
            index: offset + 1,
            total: files.length,
            name: file.name,
            percentage,
          })
        },
      })
      completed.push(saved)
    }
    return completed
  } catch (cause) {
    const error =
      cause instanceof AgendaUploadError
        ? cause
        : new AgendaUploadError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível enviar o arquivo.',
            'failed',
          )
    throw new AgendaUploadError(
      withPartial(error.message, completed.length),
      error.code,
      completed,
    )
  }
}

function assertFiles(files: File[]) {
  if (files.length > maxFiles) {
    throw new AgendaUploadError(
      'É possível enviar no máximo 10 arquivos por vez.',
      'invalid',
    )
  }
  if (files.some((file) => file.size > maxBytes)) {
    throw new AgendaUploadError(
      'Cada arquivo deve ter no máximo 10 MB.',
      'invalid',
    )
  }
  if (files.some((file) => !allowedExtension.test(extensionOf(file.name)))) {
    throw new AgendaUploadError('Tipo de arquivo não permitido.', 'invalid')
  }
}

async function uploadFile(
  file: File,
  userId: string,
  options: {
    cloud: boolean
    signal?: AbortSignal
    timeoutMs: number
    onProgress: (percentage: number | null) => void
  },
): Promise<AgendaUploadFile> {
  const deadline = createDeadline(options.signal, options.timeoutMs)
  try {
    options.onProgress(null)
    if (deadline.signal.aborted) throw stopError(deadline)
    const saved = options.cloud
      ? await uploadCloud(file, userId, deadline.signal, options.onProgress)
      : await uploadDisk(file, deadline.signal)
    if (!saved?.url.startsWith('/uploads/agenda/')) {
      throw new AgendaUploadError(
        'Não foi possível enviar o arquivo.',
        'failed',
      )
    }
    options.onProgress(100)
    return { name: saved.name.slice(0, 180), url: saved.url }
  } catch (cause) {
    if (cause instanceof AgendaUploadError) throw cause
    throw stopError(deadline, cause)
  } finally {
    deadline.dispose()
  }
}

async function uploadDisk(
  file: File,
  signal: AbortSignal,
): Promise<AgendaUploadFile | undefined> {
  const body = new FormData()
  body.append('files', file)
  const uploaded = await apiRequest<AgendaUploadFile[]>(
    '/agenda-items/uploads',
    {
      method: 'POST',
      body,
      signal,
    },
  )
  return uploaded[0]
}

async function uploadCloud(
  file: File,
  userId: string,
  signal: AbortSignal,
  onProgress: (percentage: number | null) => void,
): Promise<AgendaUploadFile> {
  const extension = extensionOf(file.name)
  const filename = `${crypto.randomUUID()}.${extension}`
  const pathname = `agenda/${userId}/${filename}`
  const { clientToken } = await apiRequest<{ clientToken: string }>(
    '/agenda-items/upload-token',
    {
      method: 'POST',
      signal,
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: { pathname, clientPayload: null, multipart: false },
      }),
    },
  )
  await put(pathname, file, {
    access: 'private',
    token: clientToken,
    abortSignal: signal,
    onUploadProgress: ({ percentage }) => {
      onProgress(roundPercentage(percentage))
    },
  })
  return {
    name: file.name.slice(0, 180),
    url: `/uploads/agenda/${filename}`,
  }
}

type Deadline = {
  signal: AbortSignal
  dispose: () => void
  outcome: () => 'cancelled' | 'timeout' | null
}

function createDeadline(
  parent: AbortSignal | undefined,
  timeoutMs: number,
): Deadline {
  const controller = new AbortController()
  let outcome: 'cancelled' | 'timeout' | null = parent?.aborted
    ? 'cancelled'
    : null
  const onParent = () => {
    outcome = 'cancelled'
    controller.abort()
  }
  if (parent?.aborted) controller.abort()
  else parent?.addEventListener('abort', onParent, { once: true })
  const timer = setTimeout(() => {
    if (outcome === 'cancelled') return
    outcome = 'timeout'
    controller.abort()
  }, timeoutMs)
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      parent?.removeEventListener('abort', onParent)
    },
    outcome: () => outcome,
  }
}

function stopError(deadline: Deadline, cause?: unknown) {
  const outcome = deadline.outcome()
  if (outcome === 'timeout') {
    return new AgendaUploadError(
      'O envio demorou demais e foi interrompido.',
      'timeout',
    )
  }
  if (outcome === 'cancelled' || isAbortError(cause)) {
    return new AgendaUploadError('Envio cancelado.', 'cancelled')
  }
  return new AgendaUploadError(
    cause instanceof Error
      ? cause.message
      : 'Não foi possível enviar o arquivo.',
    'failed',
  )
}

function withPartial(message: string, completed: number) {
  if (!completed) return message
  return `${message} Os arquivos já concluídos foram mantidos.`
}

function extensionOf(name: string) {
  return name.split('.').at(-1)?.toLowerCase() ?? ''
}

function roundPercentage(value: number) {
  if (!Number.isFinite(value)) return null
  return Math.min(100, Math.max(0, Math.round(value)))
}

function isAbortError(cause: unknown) {
  return (
    (cause instanceof DOMException && cause.name === 'AbortError') ||
    (cause instanceof Error && cause.name === 'AbortError')
  )
}
