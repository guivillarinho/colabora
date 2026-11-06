import { apiRequest } from '@/lib/http-client'
import { uploadAgendaFiles, withDeadline } from './upload-agenda-files'

jest.mock('@/lib/http-client', () => ({ apiRequest: jest.fn() }))
jest.mock('@vercel/blob/client', () => ({
  put: jest.fn(async () => ({ url: 'https://blob.example/file' })),
}))

it('rejects an upload that does not finish in time', async () => {
  await expect(withDeadline(new Promise(() => undefined), 20)).rejects.toThrow(
    'O envio demorou demais. Tente novamente.',
  )
})

it('returns the upload when it finishes before the deadline', async () => {
  await expect(withDeadline(Promise.resolve('ok'), 50)).resolves.toBe('ok')
})

describe('uploadAgendaFiles', () => {
  const previous = {
    cloud: process.env.VITE_CLOUD_UPLOADS,
    chunks: process.env.VITE_UPLOAD_CHUNK_BYTES,
  }

  afterEach(() => {
    if (previous.cloud === undefined) delete process.env.VITE_CLOUD_UPLOADS
    else process.env.VITE_CLOUD_UPLOADS = previous.cloud
    if (previous.chunks === undefined)
      delete process.env.VITE_UPLOAD_CHUNK_BYTES
    else process.env.VITE_UPLOAD_CHUNK_BYTES = previous.chunks
    jest.mocked(apiRequest).mockReset()
  })

  it('sends preview files in parts when Blob is not configured', async () => {
    process.env.VITE_CLOUD_UPLOADS = 'false'
    process.env.VITE_UPLOAD_CHUNK_BYTES = '4'
    jest.mocked(apiRequest).mockImplementation(async (_path, init) => {
      const body = init?.body as FormData
      const part = body.get('part')
      if (part === '2') {
        return {
          uploadId: '11111111-1111-4111-8111-111111111111',
          name: 'nota.txt',
          url: '/uploads/agenda/11111111-1111-4111-8111-111111111111.txt',
        }
      }
      return { uploadId: '11111111-1111-4111-8111-111111111111' }
    })
    const file = new File(['abcdefghij'], 'nota.txt', { type: 'text/plain' })
    await expect(uploadAgendaFiles([file], 'user')).resolves.toEqual([
      {
        name: 'nota.txt',
        url: '/uploads/agenda/11111111-1111-4111-8111-111111111111.txt',
      },
    ])
    expect(apiRequest).toHaveBeenCalledTimes(3)
    const first = jest.mocked(apiRequest).mock.calls[0]
    const last = jest.mocked(apiRequest).mock.calls[2]
    expect(first?.[0]).toBe('/agenda-items/upload-parts')
    expect((first?.[1]?.body as FormData).get('total')).toBe('3')
    expect((first?.[1]?.body as FormData).get('uploadId')).toBeNull()
    expect((last?.[1]?.body as FormData).get('part')).toBe('2')
    expect((last?.[1]?.body as FormData).get('uploadId')).toBe(
      '11111111-1111-4111-8111-111111111111',
    )
    expect(((last?.[1]?.body as FormData).get('chunk') as Blob).size).toBe(2)
  })

  it('keeps the direct Blob upload when cloud storage is configured', async () => {
    process.env.VITE_CLOUD_UPLOADS = 'true'
    process.env.VITE_UPLOAD_CHUNK_BYTES = '4'
    jest.mocked(apiRequest).mockResolvedValue({ clientToken: 'token' })
    const file = new File(['abc'], 'nota.txt', { type: 'text/plain' })
    const uploaded = await uploadAgendaFiles([file], 'user')
    expect(uploaded[0]?.url).toMatch(/^\/uploads\/agenda\/[0-9a-f-]+\.txt$/)
    expect(jest.mocked(apiRequest).mock.calls[0]?.[0]).toBe(
      '/agenda-items/upload-token',
    )
  })

  it('rejects a file above 10 MB before sending it', async () => {
    const file = new File(['x'], 'grande.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 + 1 })
    await expect(uploadAgendaFiles([file], 'user')).rejects.toThrow(
      'Cada arquivo deve ter no máximo 10 MB.',
    )
    expect(apiRequest).not.toHaveBeenCalled()
  })
})
