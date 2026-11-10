import { stripImageMetadata } from './avatar'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function pngWithSecret(): Buffer {
  const marker = Buffer.from('49454e44', 'hex')
  const start = onePixelPng.indexOf(marker) - 4
  return Buffer.concat([
    onePixelPng.subarray(0, start),
    pngChunk('tEXt', Buffer.from('Comment\0SecretGPS', 'ascii')),
    onePixelPng.subarray(start),
  ])
}

describe('stripImageMetadata', () => {
  it('drops PNG text metadata and keeps a displayable image', () => {
    const dirty = pngWithSecret()
    expect(dirty.includes(Buffer.from('SecretGPS'))).toBe(true)
    const clean = stripImageMetadata(dirty)
    expect(clean?.contentType).toBe('image/png')
    expect(clean?.bytes.includes(Buffer.from('SecretGPS'))).toBe(false)
    expect(clean?.bytes.includes(Buffer.from('IHDR'))).toBe(true)
    expect(clean?.bytes.includes(Buffer.from('IDAT'))).toBe(true)
    expect(stripImageMetadata(clean!.bytes)?.extension).toBe('png')
  })

  it('drops JPEG EXIF segments', () => {
    const image = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xe1, 0x00, 0x11]),
      Buffer.from('Exif\0\0SecretGPS', 'ascii'),
      Buffer.from([
        0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11,
        0x00,
      ]),
      Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
      Buffer.from([0xff, 0xd9]),
    ])
    const clean = stripImageMetadata(image)
    expect(clean?.extension).toBe('jpg')
    expect(clean?.bytes.includes(Buffer.from('SecretGPS'))).toBe(false)
    expect(clean?.bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
    expect(clean?.bytes.includes(Buffer.from([0xff, 0xc0]))).toBe(true)
  })

  it('keeps a real extended WebP frame and transparency while stripping metadata', () => {
    const image = Buffer.from(
      'UklGRkAAAABXRUJQVlA4WAoAAAAYAAAAAQAAAQAAVlA4TBAAAAAvAUAAEAdQmZJFAQMR0f8ARVhJRgkAAABTZWNyZXRHUFMA',
      'base64',
    )
    const clean = stripImageMetadata(image)
    expect(clean?.extension).toBe('webp')
    expect(clean?.bytes.includes(Buffer.from('SecretGPS'))).toBe(false)
    expect(clean?.bytes.includes(Buffer.from('VP8L'))).toBe(true)
    expect(clean?.bytes[20]).toBe(0x10)
    expect(stripImageMetadata(clean!.bytes)?.bytes).toEqual(clean?.bytes)

    image[20] |= 0x02
    expect(stripImageMetadata(image)).toBeNull()
  })

  it('rejects files that are not PNG, JPEG or WebP', () => {
    expect(stripImageMetadata(Buffer.from('not an image'))).toBeNull()
    expect(stripImageMetadata(Buffer.alloc(0))).toBeNull()
  })
})
