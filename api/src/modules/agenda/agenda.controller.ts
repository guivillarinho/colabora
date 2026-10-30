import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname } from 'node:path'
import { randomUUID } from 'node:crypto'

import { CreateAgendaItemDto } from './dto/create-agenda-item.dto'
import { AgendaService } from './agenda.service'

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

  @Post('uploads')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: 'uploads/agenda',
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
}
