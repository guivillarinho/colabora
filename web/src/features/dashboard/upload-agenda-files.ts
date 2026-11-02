import { apiRequest } from '@/lib/http-client'
declare const process: {
  env: { VITE_CLOUD_UPLOADS?: string; VITE_API_URL?: string }
}

export async function uploadAgendaFiles(
  files: File[],
  userId: string,
): Promise<Array<{ name: string; url: string }>> {
  if (files.some((file) => file.size > 10 * 1024 * 1024)) {
    throw new Error('Cada arquivo deve ter no máximo 10 MB.')
  }
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
  const body = new FormData()
  files.forEach((file) => body.append('files', file))
  return apiRequest<Array<{ name: string; url: string }>>(
    '/agenda-items/uploads',
    { method: 'POST', body },
  )
}
