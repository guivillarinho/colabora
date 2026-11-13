import { CurrentUser } from '../auth/auth.decorators'
import type { Identity } from '../auth/entities/user.entity'
import { AttachmentsService } from './attachments.service'
import { attachmentContentType, openAttachment } from './attachment-storage'
import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common'

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
    return new StreamableFile(await openAttachment(file), {
      type: attachmentContentType(file.filename),
      disposition: `attachment; filename="${file.filename}"`,
    })
  }
}
