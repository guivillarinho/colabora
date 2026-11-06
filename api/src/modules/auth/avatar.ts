import { createHash } from 'node:crypto'
import { resolve, sep } from 'node:path'
import { uploadsDirectory } from '../../uploads-directory'

export const AVATAR_PRESETS = [
  'violet',
  'leaf',
  'wave',
  'sun',
  'ember',
] as const
export type AvatarPreset = (typeof AVATAR_PRESETS)[number]
export const AVATAR_MAX_BYTES = 10 * 1024 * 1024

export type PublicAvatar =
  { kind: 'preset'; id: AvatarPreset } | { kind: 'image'; revision: string }

export type CleanImage = {
  bytes: Buffer
  extension: 'png' | 'jpg' | 'webp'
  contentType: 'image/png' | 'image/jpeg' | 'image/webp'
}

const presetKey = /^preset:(violet|leaf|wave|sun|ember)$/
const storedKey =
  /^avatars\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|jpe?g|webp)$/i
export const avatarFilename =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$/i

export function presentAvatar(
  key: string | null | undefined,
): PublicAvatar | null {
  if (!key) return null
  const preset = presetKey.exec(key)
  if (preset) return { kind: 'preset', id: preset[1] as AvatarPreset }
  if (!storedKey.test(key)) return null
  return {
    kind: 'image',
    revision: createHash('sha256').update(key).digest('hex').slice(0, 16),
  }
}

export function presetAvatarKey(preset: AvatarPreset): string {
  return `preset:${preset}`
}

export function incomingAvatarPath(userId: string, filename: string): string {
  return `avatars/${userId}/incoming/${filename.toLowerCase()}`
}

export function finalAvatarPath(userId: string, filename: string): string {
  return `avatars/${userId}/${filename.toLowerCase()}`
}

export function ownedStoredKey(
  key: string | null | undefined,
  userId: string,
): {
  extension: CleanImage['extension']
  contentType: CleanImage['contentType']
} | null {
  const match = key ? storedKey.exec(key) : null
  if (!match || match[1].toLowerCase() !== userId.toLowerCase()) return null
  const extension = normalizeExtension(match[3])
  if (!extension) return null
  return { extension, contentType: contentTypeFor(extension) }
}

export function avatarDiskPath(key: string): string | null {
  if (!storedKey.test(key)) return null
  const root = resolve(uploadsDirectory())
  const path = resolve(root, key)
  if (path !== root && !path.startsWith(`${root}${sep}`)) return null
  return path
}

export function extensionMatches(filename: string, image: CleanImage): boolean {
  const extension = filename.split('.').at(-1)?.toLowerCase() ?? ''
  if (image.extension === 'jpg')
    return extension === 'jpg' || extension === 'jpeg'
  return extension === image.extension
}

export function stripImageMetadata(input: Buffer): CleanImage | null {
  if (input.length === 0 || input.length > AVATAR_MAX_BYTES) return null
  return stripPng(input) ?? stripJpeg(input) ?? stripWebp(input)
}

function normalizeExtension(value: string): CleanImage['extension'] | null {
  const extension = value.toLowerCase()
  if (extension === 'png' || extension === 'webp') return extension
  if (extension === 'jpg' || extension === 'jpeg') return 'jpg'
  return null
}

function contentTypeFor(
  extension: CleanImage['extension'],
): CleanImage['contentType'] {
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  return 'image/jpeg'
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const keptPngChunks = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS'])

function stripPng(input: Buffer): CleanImage | null {
  if (input.length < 8 || !input.subarray(0, 8).equals(pngSignature))
    return null
  const chunks: Buffer[] = [pngSignature]
  let offset = 8
  let sawHeader = false
  let sawData = false
  let sawEnd = false
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset)
    if (length > input.length - offset - 12) return null
    const type = input.toString('ascii', offset + 4, offset + 8)
    if (!/^[A-Za-z]{4}$/.test(type)) return null
    const end = offset + 12 + length
    const chunk = input.subarray(offset, end)
    const declared = chunk.readUInt32BE(8 + length)
    if (crc32(chunk.subarray(4, 8 + length)) !== declared) return null
    if (keptPngChunks.has(type)) {
      if (type === 'IHDR') {
        if (length !== 13 || sawHeader) return null
        const width = chunk.readUInt32BE(8)
        const height = chunk.readUInt32BE(12)
        if (width < 1 || height < 1 || width > 8000 || height > 8000)
          return null
        sawHeader = true
      }
      if (type === 'IDAT') sawData = true
      if (type === 'IEND') {
        if (length !== 0) return null
        sawEnd = true
      }
      chunks.push(chunk)
      if (sawEnd) break
    }
    offset = end
  }
  if (!sawHeader || !sawData || !sawEnd) return null
  return {
    bytes: Buffer.concat(chunks),
    extension: 'png',
    contentType: 'image/png',
  }
}

function stripJpeg(input: Buffer): CleanImage | null {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return null
  const parts: Buffer[] = [input.subarray(0, 2)]
  let offset = 2
  let sawFrame = false
  let sawScan = false
  while (offset + 1 < input.length) {
    if (input[offset] !== 0xff) return null
    while (offset < input.length && input[offset] === 0xff) offset += 1
    if (offset >= input.length) return null
    const marker = input[offset]
    offset += 1
    if (marker === 0xd9) {
      parts.push(Buffer.from([0xff, 0xd9]))
      break
    }
    if (
      marker === 0x00 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd8)
    )
      continue
    if (offset + 2 > input.length) return null
    const length = input.readUInt16BE(offset)
    if (length < 2 || offset + length > input.length) return null
    const segment = input.subarray(offset - 2, offset + length)
    if (marker === 0xda) {
      if (!sawFrame) return null
      parts.push(segment)
      const scan = offset + length
      let end = scan
      while (end + 1 < input.length) {
        if (input[end] === 0xff) {
          const next = input[end + 1]
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
            end += 2
            continue
          }
          break
        }
        end += 1
      }
      parts.push(input.subarray(scan, end))
      offset = end
      sawScan = true
      continue
    }
    const isMetadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe
    if (!isMetadata) {
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        if (length < 8) return null
        const height = input.readUInt16BE(offset + 3)
        const width = input.readUInt16BE(offset + 5)
        if (width < 1 || height < 1 || width > 8000 || height > 8000)
          return null
        sawFrame = true
      }
      parts.push(segment)
    }
    offset += length
  }
  if (!sawFrame || !sawScan) return null
  const bytes = Buffer.concat(parts)
  if (bytes.length > AVATAR_MAX_BYTES) return null
  return { bytes, extension: 'jpg', contentType: 'image/jpeg' }
}

function stripWebp(input: Buffer): CleanImage | null {
  if (
    input.length < 12 ||
    input.toString('ascii', 0, 4) !== 'RIFF' ||
    input.toString('ascii', 8, 12) !== 'WEBP'
  )
    return null
  const declared = input.readUInt32LE(4)
  if (declared < 4 || declared + 8 > input.length) return null
  const end = declared + 8
  const chunks: Array<{ type: string; data: Buffer }> = []
  let offset = 12
  while (offset + 8 <= end) {
    const type = input.toString('ascii', offset, offset + 4)
    if (!/^[A-Za-z0-9 ]{4}$/.test(type)) return null
    const size = input.readUInt32LE(offset + 4)
    const dataEnd = offset + 8 + size
    if (dataEnd > end) return null
    chunks.push({
      type,
      data: Buffer.from(input.subarray(offset + 8, dataEnd)),
    })
    offset = dataEnd + (size & 1)
    if (offset > end) return null
  }
  if (offset !== end) return null
  const frames = chunks.filter((chunk) =>
    ['VP8 ', 'VP8L', 'VP8X'].includes(chunk.type),
  )
  if (frames.length !== 1 || frames[0].data.length < 10) return null
  if (frames[0].type === 'VP8X') {
    if (frames[0].data[0] & 0x10) return null
    frames[0].data[0] &= ~0x0c
  }
  const kept = chunks.filter(
    (chunk) => chunk.type !== 'EXIF' && chunk.type !== 'XMP ',
  )
  const body: Buffer[] = []
  for (const chunk of kept) {
    const header = Buffer.alloc(8)
    header.write(chunk.type, 0, 4, 'ascii')
    header.writeUInt32LE(chunk.data.length, 4)
    body.push(header, chunk.data)
    if (chunk.data.length & 1) body.push(Buffer.from([0]))
  }
  const payload = Buffer.concat(body)
  const riff = Buffer.alloc(12)
  riff.write('RIFF', 0, 4, 'ascii')
  riff.writeUInt32LE(4 + payload.length, 4)
  riff.write('WEBP', 8, 4, 'ascii')
  return {
    bytes: Buffer.concat([riff, payload]),
    extension: 'webp',
    contentType: 'image/webp',
  }
}
