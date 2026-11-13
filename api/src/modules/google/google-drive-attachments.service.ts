import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'

import {
  attachmentContentType,
  openAttachment,
} from '../agenda/attachment-storage'
import {
  attachmentFilename,
  AttachmentsService,
} from '../agenda/attachments.service'
import type { GoogleEventAttachment } from './google-calendar.client'

const driveOrigin = 'https://www.googleapis.com'
const driveFiles = `${driveOrigin}/drive/v3/files`
const uploadPath = '/upload/drive/v3/files'
const fileFields = 'id,webViewLink,trashed'
const maxBytes = 10 * 1024 * 1024

@Injectable()
export class GoogleDriveAttachmentsService {
  constructor(
    private readonly source: DataSource,
    private readonly files: AttachmentsService,
  ) {}

  async copy(
    access: string,
    subject: string,
    ownerId: string,
    references: string[],
  ): Promise<GoogleEventAttachment[]> {
    const result: GoogleEventAttachment[] = []
    for (const reference of new Set(references)) {
      const [title, path, extra] = reference.split('||')
      const prefix = '/uploads/agenda/'
      if (!title || extra !== undefined || !path?.startsWith(prefix)) continue
      const filename = path.slice(prefix.length)
      if (!attachmentFilename.test(filename)) continue

      const file = await this.files.owned(filename, ownerId)
      const mimeType = attachmentContentType(filename)
      const id = await this.reserveId(access, file.id, subject)
      const url = `${driveFiles}/${encodeURIComponent(id)}?fields=${fileFields}`
      let remote = await this.request(url, access)
      if (remote.status === 404) {
        const chunks: Uint8Array[] = []
        let size = 0
        for await (const chunk of await openAttachment(file)) {
          const bytes = Buffer.from(chunk as Uint8Array)
          size += bytes.length
          if (size > maxBytes) throw new Error('Anexo excede 10 MB.')
          chunks.push(bytes)
        }
        remote = await this.upload(
          access,
          id,
          title,
          mimeType,
          Buffer.concat(chunks),
        )
        if (remote.status === 409) remote = await this.request(url, access)
      }
      if (!remote.ok)
        throw new Error('Não foi possível copiar o anexo para o Google Drive.')
      const saved = (await remote.json()) as {
        id?: string
        webViewLink?: string
        trashed?: boolean
      }
      if (saved.id !== id || !saved.webViewLink || saved.trashed)
        throw new Error('Arquivo indisponível no Google Drive.')
      result.push({ fileId: id, fileUrl: saved.webViewLink, title, mimeType })
    }
    return result
  }

  private async reserveId(
    access: string,
    attachmentId: string,
    subject: string,
  ) {
    const existing = await this.source.query(
      'SELECT "driveFileId" FROM google_drive_attachments WHERE "attachmentId"=$1 AND "googleSubject"=$2',
      [attachmentId, subject],
    )
    if (existing[0]) return existing[0].driveFileId as string

    const response = await this.request(
      `${driveFiles}/generateIds?count=1`,
      access,
    )
    if (!response.ok)
      throw new Error('Não foi possível preparar o envio ao Google Drive.')
    const body = (await response.json()) as { ids?: string[] }
    const id = body.ids?.[0]
    if (!id) throw new Error('O Google Drive não retornou o ID do arquivo.')
    // Keep the same ID if an upload completes after a timeout or another worker
    // reserves an ID for this file first.
    const rows = await this.source.query(
      `INSERT INTO google_drive_attachments ("attachmentId","googleSubject","driveFileId")
       VALUES ($1,$2,$3)
       ON CONFLICT ("attachmentId","googleSubject") DO UPDATE
       SET "driveFileId"=google_drive_attachments."driveFileId"
       RETURNING "driveFileId"`,
      [attachmentId, subject, id],
    )
    return rows[0].driveFileId as string
  }

  private async upload(
    access: string,
    id: string,
    name: string,
    mimeType: string,
    bytes: Buffer<ArrayBuffer>,
  ) {
    const response = await this.request(
      `${driveOrigin}${uploadPath}?uploadType=resumable&fields=${fileFields}`,
      access,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': mimeType,
          'X-Upload-Content-Length': String(bytes.length),
        },
        body: JSON.stringify({ id, name }),
      },
    )
    if (!response.ok) return response
    const uploadUrl = response.headers.get('location')
    const location = uploadUrl ? new URL(uploadUrl, driveOrigin) : null
    if (
      location?.origin !== driveOrigin ||
      location.pathname !== uploadPath ||
      location.username ||
      location.password ||
      !location.searchParams.has('upload_id')
    )
      throw new Error('Endereço de envio do Google Drive inválido.')
    return this.request(location.toString(), access, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: bytes,
    })
  }

  private request(url: string, access: string, init: RequestInit = {}) {
    return fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${access}`, ...init.headers },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
  }
}
