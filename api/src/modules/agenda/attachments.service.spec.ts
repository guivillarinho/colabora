import { BadRequestException } from '@nestjs/common'
import { parseUploadPart, storedBytes } from './attachments.service'

describe('attachment upload parts', () => {
  const chunk = Buffer.from('abc')

  it('accepts the first part of an allowed file', () => {
    expect(
      parseUploadPart(
        { part: '0', total: '2', originalName: 'a||b.TXT' },
        chunk,
      ),
    ).toMatchObject({ part: 0, total: 2, originalName: 'a b.txt' })
  })

  it('rejects a part that is not a continuation of the same upload', () => {
    expect(() =>
      parseUploadPart(
        { part: '1', total: '2', originalName: 'nota.txt' },
        chunk,
      ),
    ).toThrow(BadRequestException)
    expect(() =>
      parseUploadPart(
        {
          part: '0',
          total: '2',
          originalName: 'nota.txt',
          uploadId: '12345678-1234-1234-1234-123456789abc',
        },
        chunk,
      ),
    ).toThrow(BadRequestException)
    expect(() =>
      parseUploadPart(
        { part: '0', total: '2', originalName: 'pagina.html' },
        chunk,
      ),
    ).toThrow('Tipo de arquivo não permitido.')
  })

  it('decodes bytea text returned by the database driver', () => {
    expect(storedBytes('\\x6f6c61')).toEqual(Buffer.from('ola'))
    expect(storedBytes(null)).toBeNull()
  })
})
