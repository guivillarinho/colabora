import { apiRequest } from '@/lib/http-client'
declare const process: {
  env: {
    VITE_CLOUD_UPLOADS?: string
    VITE_API_URL?: string
    VITE_UPLOAD_CHUNK_BYTES?: string
  }
}

const UPLOAD_TIMEOUT_MS = 120_000
const uploadTimeoutMessage = 'O envio demorou demais. Tente novamente.'
const maxChunkBytes = 3 * 1024 * 1024

function configuredChunkBytes(): number {
  const parsed = Number(process.env.VITE_UPLOAD_CHUNK_BYTES)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxChunkBytes)
    return 0
  return parsed
}

function uploadLabel(name: string): string {
  const trimmed = name.trim()
  const matched = trimmed.match(/\.(pdf|docx?|xlsx?|csv|txt|png|jpe?g|webp)$/i)
  const suffix = matched?.[0].toLowerCase() ?? ''
  const base = (suffix ? trimmed.slice(0, -suffix.length) : trimmed)
    .replaceAll('||', ' ')
    .trim()
  if (!suffix) return (base || 'arquivo').slice(0, 180)
  return `${(base || 'arquivo').slice(0, 180 - suffix.length)}${suffix}`
}

export function withDeadline<T>(
  work: Promise<T>,
  ms = UPLOAD_TIMEOUT_MS,
  message = uploadTimeoutMessage,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export async function uploadAgendaFiles(
  files: File[],
  userId: string,
): Promise<Array<{ name: string; url: string }>> {
  if (files.some((file) => file.size > 10 * 1024 * 1024)) {
    throw new Error('Cada arquivo deve ter no máximo 10 MB.')
  }
  return withDeadline(sendAgendaFiles(files, userId))
}

async function sendAgendaFiles(
  files: File[],
  userId: string,
): Promise<Array<{ name: string; url: string }>> {
  const signal = AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
  if (process.env.VITE_CLOUD_UPLOADS === 'true') {
    const { put } = await import('@vercel/blob/client')
    const uploaded = []
    for (const file of files) {
      const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
      if (!/^(pdf|docx?|xlsx?|csv|txt|png|jpe?g|webp)$/.test(extension)) {
        throw new Error('Tipo de arquivo não permitido.')
      }
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
      })
      uploaded.push({
        name: file.name.slice(0, 180),
        url: `/uploads/agenda/${filename}`,
      })
    }
    return uploaded
  }
  const chunkBytes = configuredChunkBytes()
  if (chunkBytes > 0) return uploadInChunks(files, chunkBytes, signal)
  const body = new FormData()
  files.forEach((file) => body.append('files', file))
  return apiRequest<Array<{ name: string; url: string }>>(
    '/agenda-items/uploads',
    { method: 'POST', body, signal },
  )
}

async function uploadInChunks(
  files: File[],
  chunkBytes: number,
  signal: AbortSignal,
): Promise<Array<{ name: string; url: string }>> {
  const uploaded: Array<{ name: string; url: string }> = []
  for (const file of files) {
    if (
      !uploadLabel(file.name).match(
        /\.(pdf|docx?|xlsx?|csv|txt|png|jpe?g|webp)$/i,
      )
    )
      throw new Error('Tipo de arquivo não permitido.')
    const total = Math.max(1, Math.ceil(file.size / chunkBytes))
    const label = uploadLabel(file.name)
    let uploadId = ''
    let saved: { name: string; url: string } | null = null
    for (let part = 0; part < total; part += 1) {
      const body = new FormData()
      body.append('part', String(part))
      body.append('total', String(total))
      body.append('originalName', label)
      if (uploadId) body.append('uploadId', uploadId)
      body.append(
        'chunk',
        file.slice(
          part * chunkBytes,
          Math.min(file.size, (part + 1) * chunkBytes),
        ),
        'chunk',
      )
      const result = await apiRequest<{
        uploadId?: string
        name?: string
        url?: string
      }>('/agenda-items/upload-parts', { method: 'POST', body, signal })
      if (result.uploadId) uploadId = result.uploadId
      if (result.name && result.url)
        saved = { name: result.name, url: result.url }
    }
    if (!saved) throw new Error('Não foi possível concluir o envio.')
    uploaded.push(saved)
  }
  return uploaded
}
