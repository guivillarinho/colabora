import { put } from '@vercel/blob/client'
import { apiRequest } from '@/lib/http-client'
import { uploadAvatar } from './upload-avatar'
import { testUser } from '@/test/auth-fixture'

jest.mock('@/lib/http-client', () => ({
  apiRequest: jest.fn(),
}))

jest.mock('@vercel/blob/client', () => ({ put: jest.fn() }))

beforeEach(() => jest.clearAllMocks())

it('rejects a document before contacting the server', async () => {
  const file = new File(['notes'], 'notas.pdf', { type: 'application/pdf' })
  await expect(uploadAvatar(file, 'user')).rejects.toThrow(
    'Use uma imagem PNG, JPEG ou WebP.',
  )
  expect(apiRequest).not.toHaveBeenCalled()
})

it('rejects a photo larger than 10 MB before contacting the server', async () => {
  const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'foto.png', {
    type: 'image/png',
  })
  await expect(uploadAvatar(file, 'user')).rejects.toThrow(
    'A foto deve ter no máximo 10 MB.',
  )
  expect(apiRequest).not.toHaveBeenCalled()
})

it('reports Blob progress and waits for server confirmation before returning the saved photo', async () => {
  const previous = process.env.VITE_CLOUD_UPLOADS
  process.env.VITE_CLOUD_UPLOADS = 'true'
  try {
    const user = { ...testUser, avatar: { kind: 'image', revision: 'new' } }
    jest
      .mocked(apiRequest)
      .mockResolvedValueOnce({ clientToken: 'token' })
      .mockResolvedValueOnce({ user })
    jest.mocked(put).mockImplementationOnce(async (_path, _file, options) => {
      options.onUploadProgress?.({ loaded: 4, total: 10, percentage: 39.7 })
      return {} as Awaited<ReturnType<typeof put>>
    })
    const file = new File(['image'], 'photo', { type: 'image/jpeg' })
    const progress = jest.fn()
    await expect(uploadAvatar(file, 'user', progress)).resolves.toEqual(user)
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^avatars\/user\/incoming\/.*\.jpg$/),
      file,
      expect.objectContaining({ contentType: 'image/jpeg', access: 'private' }),
    )
    expect(progress.mock.calls).toEqual([[40], [100]])
    expect(apiRequest).toHaveBeenLastCalledWith(
      '/users/me/avatar/confirm',
      expect.objectContaining({ method: 'POST' }),
    )
  } finally {
    if (previous === undefined) delete process.env.VITE_CLOUD_UPLOADS
    else process.env.VITE_CLOUD_UPLOADS = previous
  }
})
