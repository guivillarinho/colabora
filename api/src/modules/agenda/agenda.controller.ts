import { CurrentUser } from '../auth/auth.decorators'
import type { Identity } from '../auth/entities/user.entity'
import { AttachmentsService, attachmentFilename } from './attachments.service'
import { RateLimitService } from '../auth/rate-limit.service'
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFiles,
  Req,
  ServiceUnavailableException,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import type { Request } from 'express'

import { AddAgendaAttachmentDto } from './dto/add-agenda-attachment.dto'
import { CreateAgendaItemDto } from './dto/create-agenda-item.dto'
import { UpdateAgendaItemDto } from './dto/update-agenda-item.dto'
import { AgendaService } from './agenda.service'
import { uploadsDirectory } from '../../uploads-directory'
import { UploadQuotaGuard } from './upload-quota.guard'

@Controller('agenda-items')
export class AgendaController {
  constructor(
    private readonly agenda: AgendaService,
    private readonly attachments: AttachmentsService,
    private readonly limits: RateLimitService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: Identity) {
    return this.agenda.findAll(user.id)
  }

  @Post()
  create(@Body() dto: CreateAgendaItemDto, @CurrentUser() user: Identity) {
    return this.agenda.create(dto, user.id)
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgendaItemDto,
    @CurrentUser() user: Identity,
  ) {
    return this.agenda.update(id, dto, user.id)
  }

  @Post(':id/attachments')
  async addAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddAgendaAttachmentDto,
    @CurrentUser() user: Identity,
  ) {
    return this.agenda.addAttachment(id, dto.reference, user.id)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Identity,
  ) {
    return this.agenda.remove(id, user.id)
  }

  @Post('uploads')
  @UseGuards(UploadQuotaGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          if (process.env.VERCEL) {
            callback(
              new BadRequestException('Use o envio direto de anexos na nuvem.'),
              '',
            )
          } else {
            callback(null, uploadsDirectory())
          }
        },
        filename: (_request, file, callback) => {
          callback(
            null,
            `${randomUUID()}${extname(file.originalname).toLowerCase().slice(0, 12)}`,
          )
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        const allowed = /\.(pdf|docx?|xlsx?|csv|txt|png|jpe?g|webp)$/i.test(
          file.originalname,
        )
        callback(
          allowed
            ? null
            : new BadRequestException('Tipo de arquivo não permitido.'),
          allowed,
        )
      },
    }),
  )
  async upload(
    @UploadedFiles() files: Array<{ originalname: string; filename: string }>,
    @CurrentUser() user: Identity,
  ) {
    if (!files?.length)
      throw new BadRequestException('Selecione ao menos um arquivo.')
    for (const file of files)
      await this.attachments.register(
        file.filename,
        user.id,
        `agenda/${file.filename}`,
      )
    return files.map((file) => ({
      name: file.originalname.slice(0, 180),
      url: `/uploads/agenda/${file.filename}`,
    }))
  }

  @Post('upload-token')
  uploadToken(
    @Body() body: HandleUploadBody,
    @Req() request: Request,
    @CurrentUser() user: Identity,
  ) {
    if (!process.env.VERCEL || !process.env.BLOB_READ_WRITE_TOKEN) {
      throw new ServiceUnavailableException(
        'Armazenamento de anexos não configurado.',
      )
    }
    return handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const prefix = `agenda/${user.id}/`
        if (
          !pathname.startsWith(prefix) ||
          !attachmentFilename.test(pathname.slice(prefix.length))
        ) {
          throw new BadRequestException('Tipo de arquivo não permitido.')
        }
        await this.limits.consume('uploads', user.id, 30, 3600)
        await this.attachments.register(
          pathname.slice(prefix.length),
          user.id,
          pathname,
        )
        return {
          maximumSizeInBytes: 10 * 1024 * 1024,
          validUntil: Date.now() + 5 * 60_000,
          addRandomSuffix: false,
          allowOverwrite: false,
        }
      },
    })
  }
}
