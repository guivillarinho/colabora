import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  Req,
  ServiceUnavailableException,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import type { Request } from 'express'

import { CreateAgendaItemDto } from './dto/create-agenda-item.dto'
import { AgendaService } from './agenda.service'
import { uploadsDirectory } from '../../uploads-directory'

@Controller('agenda-items')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  findAll() {
    return this.agenda.findAll()
  }

  @Post()
  create(@Body() dto: CreateAgendaItemDto) {
    return this.agenda.create(dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.agenda.remove(id)
  }

  @Post('uploads')
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
            `${randomUUID()}${extname(file.originalname).slice(0, 12)}`,
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
  upload(
    @UploadedFiles() files: Array<{ originalname: string; filename: string }>,
  ) {
    if (!files?.length)
      throw new BadRequestException('Selecione ao menos um arquivo.')
    return files.map((file) => ({
      name: file.originalname.slice(0, 180),
      url: `/uploads/agenda/${file.filename}`,
    }))
  }

  @Post('upload-token')
  uploadToken(@Body() body: HandleUploadBody, @Req() request: Request) {
    if (!process.env.VERCEL || !process.env.BLOB_READ_WRITE_TOKEN) {
      throw new ServiceUnavailableException(
        'Armazenamento de anexos não configurado.',
      )
    }
    return handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (
          !/^agenda\/[0-9a-f-]{36}\.(pdf|docx?|xlsx?|csv|txt|png|jpe?g|webp)$/i.test(
            pathname,
          )
        ) {
          throw new BadRequestException('Tipo de arquivo não permitido.')
        }
        return {
          maximumSizeInBytes: 10 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: false,
        }
      },
    })
  }
}
