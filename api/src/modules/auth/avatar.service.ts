import { del, get, put } from '@vercel/blob'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { Repository } from 'typeorm'
import { RateLimitService } from './rate-limit.service'
import { User, type Identity } from './entities/user.entity'
import {
  AVATAR_MAX_BYTES,
  type AvatarPreset,
  type CleanImage,
  avatarDiskPath,
  avatarFilename,
  extensionMatches,
  finalAvatarPath,
  incomingAvatarPath,
  ownedStoredKey,
  presentAvatar,
  presetAvatarKey,
  stripImageMetadata,
} from './avatar'

const uploadAllowance = { limit: 30, seconds: 3600 } as const

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name)

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly limits: RateLimitService,
  ) {}

  async selectPreset(userId: string, preset: AvatarPreset): Promise<Identity> {
    return this.replace(userId, presetAvatarKey(preset))
  }

  async clear(userId: string): Promise<Identity> {
    return this.replace(userId, null)
  }

  async saveLocal(userId: string, bytes: Buffer): Promise<Identity> {
    if (process.env.VERCEL)
      throw new BadRequestException('Use o envio direto da foto.')
    await this.limits.consume(
      'uploads',
      userId,
      uploadAllowance.limit,
      uploadAllowance.seconds,
    )
    const image = this.cleaned(bytes)
    const key = finalAvatarPath(userId, `${randomUUID()}.${image.extension}`)
    const path = avatarDiskPath(key)
    if (!path) throw new BadRequestException('Foto inválida.')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, image.bytes, { flag: 'wx' })
    try {
      return await this.replace(userId, key)
    } catch (error) {
      await rm(path, { force: true })
      throw error
    }
  }

  async authorizeDirectUpload(userId: string, pathname: string) {
    this.assertCloudStorage()
    const filename = pathname.slice(`avatars/${userId}/incoming/`.length)
    if (
      pathname !== incomingAvatarPath(userId, filename) ||
      !avatarFilename.test(filename)
    )
      throw new BadRequestException('Tipo de arquivo não permitido.')
    await this.limits.consume(
      'uploads',
      userId,
      uploadAllowance.limit,
      uploadAllowance.seconds,
    )
    return {
      allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
      maximumSizeInBytes: AVATAR_MAX_BYTES,
      validUntil: Date.now() + 5 * 60_000,
      addRandomSuffix: false,
      allowOverwrite: false,
    }
  }

  async confirmDirectUpload(
    userId: string,
    filename: string,
  ): Promise<Identity> {
    this.assertCloudStorage()
    const normalized = filename.toLowerCase()
    if (!avatarFilename.test(normalized))
      throw new BadRequestException('Foto inválida.')
    const incoming = incomingAvatarPath(userId, normalized)
    const result = await get(incoming, { access: 'private', useCache: false })
    if (!result || result.statusCode !== 200)
      throw new BadRequestException(
        'Não foi possível concluir o envio da foto.',
      )
    try {
      if (result.blob.size > AVATAR_MAX_BYTES)
        throw new BadRequestException('A foto deve ter no máximo 10 MB.')
      const image = this.cleaned(await readLimited(result.stream))
      if (!extensionMatches(normalized, image))
        throw new BadRequestException(
          'O conteúdo da foto não corresponde ao tipo enviado.',
        )
      const key = finalAvatarPath(
        userId,
        `${normalized.slice(0, normalized.lastIndexOf('.'))}.${image.extension}`,
      )
      await put(key, image.bytes, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: image.contentType,
      })
      try {
        return await this.replace(userId, key)
      } catch (error) {
        await del(key).catch(() => undefined)
        throw error
      }
    } finally {
      await del(incoming).catch(() => undefined)
    }
  }

  async open(userId: string): Promise<{
    stream: Readable
    contentType: CleanImage['contentType']
    downloadName: string
  }> {
    const stored = await this.users.findOne({
      where: { id: userId },
      select: { id: true, avatarKey: true },
    })
    const image = ownedStoredKey(stored?.avatarKey, userId)
    if (!stored || !image || !stored.avatarKey)
      throw new NotFoundException('Foto não encontrada.')
    const downloadName = `avatar.${image.extension}`
    if (process.env.VERCEL) {
      const result = await get(stored.avatarKey, {
        access: 'private',
        useCache: false,
      })
      if (!result || result.statusCode !== 200)
        throw new NotFoundException('Foto não encontrada.')
      return {
        stream: webStreamToNode(result.stream),
        contentType: image.contentType,
        downloadName,
      }
    }
    const path = avatarDiskPath(stored.avatarKey)
    if (!path || !existsSync(path))
      throw new NotFoundException('Foto não encontrada.')
    return {
      stream: createReadStream(path),
      contentType: image.contentType,
      downloadName,
    }
  }

  private cleaned(bytes: Buffer): CleanImage {
    const image = stripImageMetadata(bytes)
    if (!image)
      throw new BadRequestException('Use uma imagem PNG, JPEG ou WebP.')
    return image
  }

  private assertCloudStorage(): void {
    if (!process.env.VERCEL || !process.env.BLOB_READ_WRITE_TOKEN)
      throw new ServiceUnavailableException(
        'Armazenamento de fotos não configurado.',
      )
  }

  private async replace(
    userId: string,
    next: string | null,
  ): Promise<Identity> {
    const outcome = await this.users.manager.transaction(async (manager) => {
      const rows: Array<{
        avatarKey: string | null
        name: string
        email: string
      }> = await manager.query(
        `SELECT name, email, "avatarKey" FROM users WHERE id = $1 FOR UPDATE`,
        [userId],
      )
      const current = rows[0]
      if (!current) throw new NotFoundException('Conta não encontrada.')
      const updated = (await manager.query(
        `UPDATE users SET "avatarKey" = $1 WHERE id = $2 AND "avatarKey" IS NOT DISTINCT FROM $3 RETURNING id`,
        [next, userId, current.avatarKey],
      )) as [Array<{ id: string }>, number]
      if (!updated[1])
        throw new ConflictException('A foto foi alterada. Tente novamente.')
      return {
        id: userId,
        name: current.name,
        email: current.email,
        previous: current.avatarKey,
      }
    })
    if (outcome.previous && outcome.previous !== next)
      await this.discard(outcome.previous)
    return {
      id: outcome.id,
      name: outcome.name,
      email: outcome.email,
      avatar: presentAvatar(next),
    }
  }

  private async discard(key: string): Promise<void> {
    try {
      const ownerId = /^avatars\/([^/]+)\//.exec(key)?.[1]
      if (process.env.VERCEL) {
        if (ownerId && ownedStoredKey(key, ownerId)) await del(key)
        return
      }
      const path = avatarDiskPath(key)
      if (path) await rm(path, { force: true })
    } catch {
      this.logger.error('Não foi possível descartar a foto anterior.')
    }
  }
}

async function readLimited(
  stream: ReadableStream<Uint8Array>,
): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Buffer[] = []
  let total = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > AVATAR_MAX_BYTES)
        throw new BadRequestException('A foto deve ter no máximo 10 MB.')
      chunks.push(Buffer.from(chunk.value))
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}

function webStreamToNode(stream: ReadableStream<Uint8Array>): Readable {
  const reader = stream.getReader()
  return Readable.from(
    (async function* () {
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          yield chunk.value
        }
      } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
    })(),
  )
}
