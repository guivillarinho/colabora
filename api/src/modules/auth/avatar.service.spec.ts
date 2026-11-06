import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { del, get, put } from '@vercel/blob'
import { AvatarService } from './avatar.service'
import { avatarDiskPath, finalAvatarPath } from './avatar'
import type { User } from './entities/user.entity'

jest.mock('@vercel/blob', () => ({
  get: jest.fn(),
  put: jest.fn(),
  del: jest.fn(),
}))

const userId = '11111111-1111-4111-8111-111111111111'
const otherId = '22222222-2222-4222-8222-222222222222'
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

describe('AvatarService', () => {
  let directory: string
  const previousEnv = {
    VERCEL: process.env.VERCEL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    UPLOADS_DIRECTORY: process.env.UPLOADS_DIRECTORY,
  }
  const rows = new Map<string, User>()
  const limits = { consume: jest.fn() }
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      const id = String(sql.startsWith('SELECT') ? params[0] : params[1])
      const row = rows.get(id)
      if (sql.startsWith('SELECT')) {
        return row
          ? [{ name: row.name, email: row.email, avatarKey: row.avatarKey }]
          : []
      }
      if (!row || row.avatarKey !== params[2]) return [[], 0]
      row.avatarKey = params[0] as string | null
      return [[{ id }], 1]
    }),
  }
  const users = {
    findOne: jest.fn(async ({ where }: { where: { id: string } }) => {
      return rows.get(where.id) ?? null
    }),
    manager: {
      transaction: (work: (current: typeof manager) => Promise<unknown>) =>
        work(manager),
    },
  }
  const service = new AvatarService(users as never, limits as never)

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'colabora-avatar-'))
    process.env.UPLOADS_DIRECTORY = directory
    delete process.env.VERCEL
    delete process.env.BLOB_READ_WRITE_TOKEN
    rows.clear()
    rows.set(userId, {
      id: userId,
      name: 'Ada',
      email: 'ada@example.test',
      passwordHash: 'hash',
      avatarKey: null,
      createdAt: new Date(),
    })
    rows.set(otherId, {
      id: otherId,
      name: 'Bruno',
      email: 'bruno@example.test',
      passwordHash: 'hash',
      avatarKey: null,
      createdAt: new Date(),
    })
    jest.clearAllMocks()
    jest.mocked(del).mockResolvedValue(undefined)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('stores a private image, serves it only to the owner and deletes it when replaced', async () => {
    const saved = await service.saveLocal(userId, png)
    const key = rows.get(userId)?.avatarKey
    expect(saved.avatar).toEqual({
      kind: 'image',
      revision: expect.stringMatching(/^[0-9a-f]{16}$/),
    })
    expect(JSON.stringify(saved)).not.toContain('avatars/')
    expect(key && existsSync(avatarDiskPath(key) ?? '')).toBe(true)
    await expect(service.open(otherId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    const own = await service.open(userId)
    const chunks: Buffer[] = []
    for await (const chunk of own.stream) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks).subarray(0, 8)).toEqual(png.subarray(0, 8))
    own.stream.destroy()

    const replaced = await service.selectPreset(userId, 'leaf')
    expect(replaced.avatar).toEqual({ kind: 'preset', id: 'leaf' })
    expect(
      existsSync(avatarDiskPath(key ?? '') ?? join(directory, 'missing')),
    ).toBe(false)
    await expect(service.open(userId)).rejects.toBeInstanceOf(NotFoundException)
    expect(limits.consume).toHaveBeenCalledWith('uploads', userId, 30, 3600)
  })

  it('rejects a file that is not an image and keeps the previous choice', async () => {
    await service.selectPreset(userId, 'sun')
    await expect(
      service.saveLocal(userId, Buffer.from('not an image')),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(rows.get(userId)?.avatarKey).toBe('preset:sun')
  })

  it('confirms a private blob only after cleaning it and discards the previous one', async () => {
    process.env.VERCEL = '1'
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token'
    const previous = finalAvatarPath(
      userId,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',
    )
    rows.get(userId)!.avatarKey = previous
    const filename = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png'
    jest.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(png)
          controller.close()
        },
      }),
      blob: { size: png.length, contentType: 'text/html' },
    } as NonNullable<Awaited<ReturnType<typeof get>>>)
    jest.mocked(put).mockResolvedValue({} as Awaited<ReturnType<typeof put>>)

    const saved = await service.confirmDirectUpload(userId, filename)
    expect(saved.avatar?.kind).toBe('image')
    expect(put).toHaveBeenCalledWith(
      finalAvatarPath(userId, filename),
      expect.any(Buffer),
      expect.objectContaining({
        access: 'private',
        allowOverwrite: false,
        contentType: 'image/png',
      }),
    )
    expect(del).toHaveBeenCalledWith(`avatars/${userId}/incoming/${filename}`)
    expect(del).toHaveBeenCalledWith(previous)
    expect(rows.get(userId)?.avatarKey).toBe(finalAvatarPath(userId, filename))
    await expect(
      service.authorizeDirectUpload(
        userId,
        `avatars/${otherId}/incoming/${filename}`,
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
