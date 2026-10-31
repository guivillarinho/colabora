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

@Controller('uploads/agenda')
export class AgendaFilesController {
  @Get(':filename')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(@Param('filename') filename: string) {
    if (
      !process.env.VERCEL ||
      !/^[0-9a-f-]{36}\.(pdf|docx?|xlsx?|csv|txt|png|jpe?g|webp)$/i.test(
        filename,
      )
    ) {
      throw new NotFoundException('Arquivo não encontrado.')
    }
    const result = await get(`agenda/${filename}`, { access: 'private' })
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
      type: result.blob.contentType || 'application/octet-stream',
    })
  }
}
