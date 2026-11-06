import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, In, Repository } from 'typeorm'
import { Attachment } from './entities/attachment.entity'

export const attachmentFilename =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx?|xlsx?|csv|txt|png|jpe?g|webp)$/i

export const maxUploadBytes = 10 * 1024 * 1024
export const maxUploadPartBytes = 3 * 1024 * 1024
const maxUploadParts = 8
const uploadIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uploadExtension = /\.(pdf|docx?|xlsx?|csv|txt|png|jpe?g|webp)$/i

export type UploadPartInput = {
  uploadId?: string
  part: number
  total: number
  originalName: string
  chunk: Buffer
}

export function storedBytes(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === 'string' && value.startsWith('\\x'))
    return Buffer.from(value.slice(2), 'hex')
  return null
}

export function parseUploadPart(
  body: Record<string, unknown>,
  chunk: Buffer | undefined,
): UploadPartInput {
  if (!chunk) throw new BadRequestException('Selecione ao menos um arquivo.')
  if (chunk.length > maxUploadPartBytes)
    throw new BadRequestException('O arquivo excede o tamanho permitido.')
  const part = readIndex(body.part)
  const total = readIndex(body.total)
  if (total < 1 || total > maxUploadParts || part >= total)
    throw new BadRequestException('Envio de anexo inválido.')
  const originalName = readUploadName(body.originalName)
  const uploadId = body.uploadId
  if (part === 0) {
    if (uploadId != null && uploadId !== '')
      throw new BadRequestException('Envio de anexo inválido.')
    return { part, total, originalName, chunk }
  }
  if (typeof uploadId !== 'string' || !uploadIdPattern.test(uploadId))
    throw new BadRequestException('Envio de anexo inválido.')
  return { uploadId, part, total, originalName, chunk }
}

function readIndex(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{1,2}$/.test(value))
    throw new BadRequestException('Envio de anexo inválido.')
  return Number(value)
}

function readUploadName(value: unknown): string {
  if (typeof value !== 'string')
    throw new BadRequestException('Envio de anexo inválido.')
  const extension = uploadExtension.exec(value.trim())?.[1]
  if (!extension)
    throw new BadRequestException('Tipo de arquivo não permitido.')
  const suffix = `.${extension.toLowerCase()}`
  const base = value
    .trim()
    .slice(0, value.trim().length - suffix.length)
    .replaceAll('||', ' ')
    .trim()
  const name = `${(base || 'arquivo').slice(0, 180 - suffix.length)}${suffix}`
  return name
}

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
    content?: Buffer,
  ): Promise<void> {
    if (!attachmentFilename.test(filename))
      throw new BadRequestException('Arquivo inválido.')
    if (content && content.length > maxUploadBytes)
      throw new BadRequestException('Cada arquivo deve ter no máximo 10 MB.')
    await this.files.insert({
      filename,
      ownerId,
      storagePath,
      content: content ?? null,
    })
  }

  async acceptPart(
    ownerId: string,
    input: UploadPartInput,
  ): Promise<{ uploadId: string; name?: string; url?: string }> {
    if (process.env.BLOB_READ_WRITE_TOKEN)
      throw new BadRequestException('Use o envio direto de anexos na nuvem.')
    const extension = uploadExtension.exec(input.originalName)?.[1]
    if (!extension)
      throw new BadRequestException('Tipo de arquivo não permitido.')
    return this.source.transaction(async (manager) => {
      if (input.part === 0) {
        await manager.query(
          `DELETE FROM attachment_uploads WHERE "createdAt" < now() - interval '1 day'`,
        )
        const id = randomUUID()
        const filename = `${randomUUID()}.${extension.toLowerCase()}`
        await manager.query(
          `INSERT INTO attachment_uploads (id, "ownerId", filename, "originalName", "totalParts", "nextPart", "byteSize", content)
           VALUES ($1, $2, $3, $4, $5, 1, $6, $7::bytea)`,
          [
            id,
            ownerId,
            filename,
            input.originalName,
            input.total,
            input.chunk.length,
            input.chunk,
          ],
        )
        if (input.total === 1)
          return this.finishUpload(manager, id, filename, input.originalName)
        return { uploadId: id }
      }
      if (!input.uploadId)
        throw new BadRequestException('Envio de anexo inválido.')
      const uploadId = input.uploadId
      const rows: Array<{
        filename: string
        originalName: string
        totalParts: number | string
        nextPart: number | string
        byteSize: number | string
      }> = await manager.query(
        `SELECT filename, "originalName", "totalParts", "nextPart", "byteSize"
         FROM attachment_uploads WHERE id = $1 AND "ownerId" = $2 FOR UPDATE`,
        [uploadId, ownerId],
      )
      const row = rows[0]
      if (!row || !attachmentFilename.test(row.filename))
        throw new BadRequestException('Envio de anexo não encontrado.')
      if (
        row.originalName !== input.originalName ||
        Number(row.totalParts) !== input.total ||
        Number(row.nextPart) !== input.part ||
        Number(row.byteSize) + input.chunk.length > maxUploadBytes
      ) {
        throw new BadRequestException(
          Number(row.byteSize) + input.chunk.length > maxUploadBytes
            ? 'Cada arquivo deve ter no máximo 10 MB.'
            : 'Envie as partes em ordem.',
        )
      }
      const updated: unknown[] = await manager.query(
        `UPDATE attachment_uploads
         SET content = content || $1::bytea, "nextPart" = "nextPart" + 1, "byteSize" = "byteSize" + octet_length($1::bytea)
         WHERE id = $2 AND "ownerId" = $3 AND "nextPart" = $4
           AND "byteSize" + octet_length($1::bytea) <= $5
         RETURNING id`,
        [input.chunk, uploadId, ownerId, input.part, maxUploadBytes],
      )
      if (!updated.length)
        throw new BadRequestException('Envie as partes em ordem.')
      if (input.part + 1 < input.total) return { uploadId }
      return this.finishUpload(
        manager,
        uploadId,
        row.filename,
        row.originalName,
      )
    })
  }

  private async finishUpload(
    manager: EntityManager,
    id: string,
    filename: string,
    originalName: string,
  ): Promise<{ uploadId: string; name: string; url: string }> {
    if (!attachmentFilename.test(filename))
      throw new BadRequestException('Arquivo inválido.')
    const inserted: unknown[] = await manager.query(
      `INSERT INTO attachments (filename, "ownerId", "storagePath", content)
       SELECT filename, "ownerId", 'db/' || filename, content
       FROM attachment_uploads WHERE id = $1
       RETURNING filename`,
      [id],
    )
    if (!inserted.length)
      throw new BadRequestException('Envio de anexo não encontrado.')
    await manager.query(`DELETE FROM attachment_uploads WHERE id = $1`, [id])
    return {
      uploadId: id,
      name: originalName,
      url: `/uploads/agenda/${filename}`,
    }
  }

  async assertOwnReferences(
    references: string[],
    ownerId: string,
  ): Promise<void> {
    const filenames: string[] = []
    for (const reference of references) {
      if (!reference.includes('||')) continue
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
    const file = await this.files
      .createQueryBuilder('attachment')
      .addSelect('attachment.content')
      .where('attachment.filename = :filename', { filename })
      .getOne()
    if (!file) throw new NotFoundException('Arquivo não encontrado.')
    file.content = storedBytes(file.content)
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
