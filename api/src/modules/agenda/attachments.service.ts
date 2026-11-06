import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, Repository } from 'typeorm'
import { Attachment } from './entities/attachment.entity'

export const attachmentFilename =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx?|xlsx?|csv|txt|png|jpe?g|webp)$/i

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Attachment)
    private readonly files: Repository<Attachment>,
    private readonly source: DataSource,
  ) {}

  async register(
    filename: string,
    ownerId: string,
    storagePath: string,
  ): Promise<void> {
    if (!attachmentFilename.test(filename))
      throw new BadRequestException('Arquivo inválido.')
    await this.files.insert({ filename, ownerId, storagePath })
  }

  async assertOwnReferences(
    references: string[],
    ownerId: string,
  ): Promise<void> {
    const filenames: string[] = []
    for (const reference of references) {
      const [name, url, extra] = reference.split('||')
      const prefix = '/uploads/agenda/'
      if (
        !name ||
        extra !== undefined ||
        !url?.startsWith(prefix) ||
        !attachmentFilename.test(url.slice(prefix.length))
      )
        throw new BadRequestException('Referência de anexo inválida.')
      filenames.push(url.slice(prefix.length))
    }
    if (!filenames.length) return
    const owned = await this.files.findBy({ filename: In(filenames), ownerId })
    if (
      new Set(owned.map((file) => file.filename)).size !==
      new Set(filenames).size
    )
      throw new BadRequestException(
        'Um dos anexos não está disponível para esta tarefa.',
      )
  }

  async readable(filename: string, userId: string): Promise<Attachment> {
    if (!attachmentFilename.test(filename))
      throw new NotFoundException('Arquivo não encontrado.')
    const file = await this.files.findOneBy({ filename })
    if (!file) throw new NotFoundException('Arquivo não encontrado.')
    if (file.ownerId !== userId) {
      const shared: unknown[] = await this.source.query(
        `SELECT 1 FROM tasks t WHERE (t."createdById" = $1 OR t."assignedToId" = $1) AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(t.attachments) AS a(value) WHERE split_part(a.value, '||', 2) = $2) LIMIT 1`,
        [userId, `/uploads/agenda/${filename}`],
      )
      if (!shared.length) throw new NotFoundException('Arquivo não encontrado.')
    }
    return file
  }
}
