import { put } from '@vercel/blob/client'

import { apiRequest } from '@/lib/http-client'
import type { AuthUser } from './auth-api'

declare const process: { env: { VITE_CLOUD_UPLOADS?: string } }

const imageExtension = /^(png|jpe?g|webp)$/
const extensionByType: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export async function uploadAvatar(
  file: File,
  userId: string,
  onProgress?: (percentage: number) => void,
): Promise<AuthUser> {
  if (file.size <= 0 || file.size > 10 * 1024 * 1024)
    throw new Error('A foto deve ter no máximo 10 MB.')
  const suffix = /\.([^.]+)$/.exec(file.name)?.[1].toLowerCase() ?? ''
  const extension = imageExtension.test(suffix)
    ? suffix
    : (extensionByType[file.type] ?? '')
  if (!imageExtension.test(extension))
    throw new Error('Use uma imagem PNG, JPEG ou WebP.')
  if (process.env.VITE_CLOUD_UPLOADS === 'true') {
    const filename = `${crypto.randomUUID()}.${extension === 'jpeg' ? 'jpg' : extension}`
    const pathname = `avatars/${userId}/incoming/${filename}`
    const { clientToken } = await apiRequest<{ clientToken: string }>(
      '/users/me/avatar/upload-token',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'blob.generate-client-token',
          payload: { pathname, clientPayload: null, multipart: false },
        }),
      },
    )
    const contentType =
      extension === 'jpg' || extension === 'jpeg'
        ? 'image/jpeg'
        : `image/${extension}`
    await put(pathname, file, {
      access: 'private',
      token: clientToken,
      contentType,
      onUploadProgress: ({ percentage }) => {
        onProgress?.(Math.min(100, Math.max(0, Math.round(percentage))))
      },
    })
    onProgress?.(100)
    const confirmed = await apiRequest<{ user: AuthUser }>(
      '/users/me/avatar/confirm',
      { method: 'POST', body: JSON.stringify({ filename }) },
    )
    return confirmed.user
  }
  const body = new FormData()
  body.append('file', file)
  const saved = await apiRequest<{ user: AuthUser }>('/users/me/avatar', {
    method: 'POST',
    body,
  })
  return saved.user
}

export async function selectAvatarPreset(preset: string): Promise<AuthUser> {
  const saved = await apiRequest<{ user: AuthUser }>('/users/me/avatar', {
    method: 'PATCH',
    body: JSON.stringify({ preset }),
  })
  return saved.user
}

export async function removeAvatar(): Promise<AuthUser> {
  const saved = await apiRequest<{ user: AuthUser }>('/users/me/avatar', {
    method: 'DELETE',
  })
  return saved.user
}
