import { BadRequestException, NotFoundException } from '@nestjs/common'

import { AttachmentsService } from './attachments.service'
import { Attachment } from './entities/attachment.entity'

const filename = '12345678-1234-1234-1234-123456789abc.pdf'
const url = `/uploads/agenda/${filename}`
const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const assigneeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const strangerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

describe('AttachmentsService', () => {
  const findBy = jest.fn()
  const findOneBy = jest.fn()
  const query = jest.fn()
  const service = new AttachmentsService(
    { findBy, findOneBy } as never,
    { query } as never,
  )
  const stored: Attachment = {
    id: 'file-1',
    filename,
    ownerId,
    storagePath: `agenda/${filename}`,
    createdAt: new Date('2026-11-06T00:00:00.000Z'),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects a bare filename so it does not count as an attachment', async () => {
    await expect(
      service.assertOwnReferences(['proposta.pdf'], ownerId),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(findBy).not.toHaveBeenCalled()
  })

  it('rejects a reference the actor does not own', async () => {
    findBy.mockResolvedValue([])
    await expect(
      service.assertOwnReferences([`proposta.pdf||${url}`], ownerId),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('accepts an owned name and url reference', async () => {
    findBy.mockResolvedValue([stored])
    await expect(
      service.assertOwnReferences([`proposta.pdf||${url}`], ownerId),
    ).resolves.toBeUndefined()
    expect(findBy).toHaveBeenCalledWith({
      filename: expect.anything(),
      ownerId,
    })
  })

  it('lets the file owner download without looking at task membership', async () => {
    findOneBy.mockResolvedValue(stored)
    await expect(service.readable(filename, ownerId)).resolves.toBe(stored)
    expect(query).not.toHaveBeenCalled()
  })

  it('lets the assignee download when the task stores the url reference', async () => {
    findOneBy.mockResolvedValue(stored)
    query.mockResolvedValue([1])
    await expect(service.readable(filename, assigneeId)).resolves.toBe(stored)
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain("split_part(a.value, '||', 2)")
    expect(sql).toContain('"createdById"')
    expect(sql).toContain('"assignedToId"')
    expect(params).toEqual([assigneeId, url])
  })

  it('hides the file from someone who is neither owner nor assignee', async () => {
    findOneBy.mockResolvedValue(stored)
    query.mockResolvedValue([])
    await expect(service.readable(filename, strangerId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('does not resolve a download from a bare filename', async () => {
    await expect(
      service.readable('proposta.pdf', ownerId),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(findOneBy).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })
})
