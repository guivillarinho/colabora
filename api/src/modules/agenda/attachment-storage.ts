import { NotFoundException } from '@nestjs/common'
import { get } from '@vercel/blob'
import { createReadStream, existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'

import { uploadsDirectory } from '../../uploads-directory'
import type { Attachment } from './entities/attachment.entity'

const contentTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
}

// Use the validated extension rather than uploader-supplied MIME metadata.
export function attachmentContentType(filename: string) {
  return (
    contentTypes[extname(filename).toLowerCase()] ?? 'application/octet-stream'
  )
}

export async function openAttachment(file: Attachment): Promise<Readable> {
  if (!process.env.VERCEL) {
    const path = join(uploadsDirectory(), file.filename)
    if (!existsSync(path))
      throw new NotFoundException('Arquivo não encontrado.')
    return createReadStream(path)
  }
  const result = await get(file.storagePath, { access: 'private' })
  if (!result || result.statusCode !== 200)
    throw new NotFoundException('Arquivo não encontrado.')
  return Readable.fromWeb(
    result.stream as import('node:stream/web').ReadableStream,
  )
}
