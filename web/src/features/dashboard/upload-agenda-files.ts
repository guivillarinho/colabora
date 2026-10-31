declare const process: {
  env: { VITE_CLOUD_UPLOADS?: string; VITE_API_URL?: string }
}

export async function uploadAgendaFiles(
  files: File[],
): Promise<Array<{ name: string; url: string }>> {
  if (files.some((file) => file.size > 10 * 1024 * 1024)) {
    throw new Error('Cada arquivo deve ter no máximo 10 MB.')
  }
  const base = process.env.VITE_API_URL ?? 'http://localhost:3000'
  if (process.env.VITE_CLOUD_UPLOADS === 'true') {
    const { upload } = await import('@vercel/blob/client')
    const uploaded = []
    for (const file of files) {
      const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
      if (!/^(pdf|docx?|xlsx?|csv|txt|png|jpe?g|webp)$/.test(extension)) {
        throw new Error('Tipo de arquivo não permitido.')
      }
      const filename = `${crypto.randomUUID()}.${extension}`
      await upload(`agenda/${filename}`, file, {
        access: 'private',
        handleUploadUrl: `${base}/agenda-items/upload-token`,
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
  const response = await fetch(`${base}/agenda-items/uploads`, {
    method: 'POST',
    body,
  })
  if (!response.ok)
    throw new Error(
      'Não foi possível enviar os documentos. Limite: 10 MB por arquivo.',
    )
  return response.json() as Promise<Array<{ name: string; url: string }>>
}
