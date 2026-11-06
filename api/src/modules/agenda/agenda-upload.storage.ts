import { BadRequestException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs'
import { extname } from 'node:path'
import { diskStorage, memoryStorage, type StorageEngine } from 'multer'

import { uploadsDirectory } from '../../uploads-directory'

function storedFilename(originalName: string): string {
  return `${randomUUID()}${extname(originalName).toLowerCase().slice(0, 12)}`
}

export function agendaUploadStorage(): StorageEngine {
  return {
    _handleFile(request, file, callback) {
      if (process.env.VERCEL && process.env.BLOB_READ_WRITE_TOKEN) {
        file.stream.resume()
        callback(
          new BadRequestException('Use o envio direto de anexos na nuvem.'),
        )
        return
      }
      if (process.env.VERCEL) {
        memoryStorage()._handleFile(request, file, (error, info) => {
          if (error || !info) {
            callback(error ?? new BadRequestException('Arquivo inválido.'))
            return
          }
          callback(null, {
            ...info,
            filename: storedFilename(file.originalname),
          })
        })
        return
      }
      diskStorage({
        destination: uploadsDirectory(),
        filename: (_request, current, done) => {
          done(null, storedFilename(current.originalname))
        },
      })._handleFile(request, file, callback)
    },
    _removeFile(_request, file, callback) {
      if (!file.path) {
        callback(null)
        return
      }
      unlink(file.path, () => callback(null))
    },
  }
}
