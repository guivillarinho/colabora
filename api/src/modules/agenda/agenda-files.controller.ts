import { CurrentUser } from '../auth/auth.decorators'
import type { Identity } from '../auth/entities/user.entity'
import { AttachmentsService } from './attachments.service'
import { createReadStream, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { uploadsDirectory } from '../../uploads-directory'
import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  StreamableFile,
} from '@nestjs/common'
import { get } from '@vercel/blob'
import { Readable } from 'node:stream'

// Never trust the MIME type supplied by an uploader or stored in Blob metadata.
const attachmentTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
}

@Controller('uploads/agenda')
export class AgendaFilesController {
  constructor(private readonly files: AttachmentsService) {}
  @Get(':filename')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  async download(
    @Param('filename') filename: string,
    @CurrentUser() user: Identity,
  ) {
    const file = await this.files.readable(filename, user.id)
    const contentType =
      attachmentTypes[extname(file.filename).toLowerCase()] ||
      'application/octet-stream'
    if (file.content != null) {
      return new StreamableFile(Buffer.from(file.content), {
        type: contentType,
        disposition: `attachment; filename="${file.filename}"`,
      })
    }
    if (!process.env.VERCEL) {
      const path = join(uploadsDirectory(), file.filename)
      if (!existsSync(path))
        throw new NotFoundException('Arquivo não encontrado.')
      return new StreamableFile(createReadStream(path), {
        type: contentType,
        disposition: `attachment; filename="${file.filename}"`,
      })
    }
    const result = await get(file.storagePath, { access: 'private' })
    if (!result || result.statusCode !== 200)
      throw new NotFoundException('Arquivo não encontrado.')
    const reader = result.stream.getReader()
    const stream = Readable.from(
      (async function* () {
        try {
          while (true) {
            const chunk = await reader.read()
            if (chunk.done) break
            yield chunk.value
          }
        } finally {
          await reader.cancel()
          reader.releaseLock()
        }
      })(),
    )
    return new StreamableFile(stream, {
      type: contentType,
      disposition: `attachment; filename="${file.filename}"`,
    })
  }
}
