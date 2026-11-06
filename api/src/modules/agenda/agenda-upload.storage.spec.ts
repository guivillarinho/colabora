import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { Express } from 'express'
import { BadRequestException } from '@nestjs/common'

import { agendaUploadStorage } from './agenda-upload.storage'
import { attachmentFilename } from './attachments.service'

function incoming(name: string, bytes: string): Express.Multer.File {
  return {
    originalname: name,
    stream: Readable.from([Buffer.from(bytes)]),
  } as Express.Multer.File
}

function store(file: Express.Multer.File) {
  const engine = agendaUploadStorage()
  return new Promise<Partial<Express.Multer.File>>((resolve, reject) => {
    engine._handleFile({} as never, file, (error, info) => {
      if (error) reject(error)
      else resolve(info ?? {})
    })
  })
}

describe('agenda upload storage', () => {
  const previous = {
    vercel: process.env.VERCEL,
    token: process.env.BLOB_READ_WRITE_TOKEN,
    directory: process.env.UPLOADS_DIRECTORY,
  }
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'colabora-upload-'))
    process.env.UPLOADS_DIRECTORY = directory
    delete process.env.VERCEL
    delete process.env.BLOB_READ_WRITE_TOKEN
  })

  afterEach(async () => {
    if (previous.vercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = previous.vercel
    if (previous.token === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
    else process.env.BLOB_READ_WRITE_TOKEN = previous.token
    if (previous.directory === undefined) delete process.env.UPLOADS_DIRECTORY
    else process.env.UPLOADS_DIRECTORY = previous.directory
    await rm(directory, { recursive: true, force: true })
  })

  it('writes local files to the uploads directory', async () => {
    const stored = await store(incoming('notas.TXT', 'local'))
    expect(stored.filename).toMatch(attachmentFilename)
    expect(stored.buffer).toBeUndefined()
    expect(await readFile(stored.path ?? '')).toEqual(Buffer.from('local'))
  })

  it('keeps serverless files in memory when Blob is not configured', async () => {
    process.env.VERCEL = '1'
    const stored = await store(incoming('notas.txt', 'nuvem'))
    expect(stored.filename).toMatch(attachmentFilename)
    expect(stored.buffer).toEqual(Buffer.from('nuvem'))
    await expect(
      readFile(join(directory, stored.filename ?? '')),
    ).rejects.toThrow()
  })

  it('refuses disk storage when private Blob is configured', async () => {
    process.env.VERCEL = '1'
    process.env.BLOB_READ_WRITE_TOKEN = 'configured'
    await expect(store(incoming('notas.txt', 'blob'))).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })
})
